import { SELF, env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { authTokens, credentials, sessions, users } from '../src/db/schema.js';
import { issueToken } from '../src/auth/verification.js';
import { hashToken } from '../src/auth/token.js';
import { createSession } from '../src/auth/session.js';
import type { Env } from '../src/env.js';

// The test worker's bindings (local D1 + RateLimiter DO), typed as the app's Env.
const testEnv = env as unknown as Env;
const db = () => createDb(testEnv);

const BASE = 'https://auth.test';
const json = { 'content-type': 'application/json' };

// Unique email per call so tests never collide, even though isolatedStorage
// already gives each test a clean database.
let n = 0;
const freshEmail = () => `user-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`;

async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: cookie ? { ...json, cookie } : json,
    body: JSON.stringify(body),
  });
}

async function get(path: string, cookie?: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, cookie ? { headers: { cookie } } : undefined);
}

/** Pull the `platform_session=<token>` pair from a response's Set-Cookie(s),
 *  ignoring the empty clearing cookie. */
function sessionCookie(res: Response): string | null {
  const cookies = res.headers.getSetCookie();
  for (const c of cookies) {
    const m = /(?:^|;\s*)(platform_session=([^;]*))/.exec(c);
    if (m && m[2]) return m[1];
  }
  return null;
}

/** Register a fresh user; returns its id, credentials, and session cookie. */
async function register(): Promise<{ id: string; email: string; password: string; cookie: string }> {
  const email = freshEmail();
  const password = 'correct horse battery';
  const res = await post('/auth/register', { email, password, displayName: 'Test User' });
  expect(res.status).toBe(201);
  const cookie = sessionCookie(res);
  expect(cookie).toBeTruthy();
  const { user } = (await res.json()) as { user: { id: string } };
  return { id: user.id, email, password, cookie: cookie! };
}

describe('registration', () => {
  it('creates an account, sets a session cookie, and hashes the password', async () => {
    const email = freshEmail();
    const res = await post('/auth/register', { email, password: 'password123', displayName: 'Ada' });
    expect(res.status).toBe(201);
    expect(sessionCookie(res)).toBeTruthy();
    const body = (await res.json()) as { user: { email: string; emailVerified: boolean } };
    expect(body.user.email).toBe(email);
    expect(body.user.emailVerified).toBe(false);

    const row = await db().select().from(users).where(eq(users.email, email)).get();
    expect(row).toBeTruthy();
    expect(row!.passwordHash).not.toContain('password123'); // never stored in the clear
    expect(row!.passwordHash.startsWith('pbkdf2$')).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const { email } = await register();
    const res = await post('/auth/register', { email, password: 'password123', displayName: 'Dupe' });
    expect(res.status).toBe(409);
  });

  it('rejects a weak password and a bad email with 400', async () => {
    expect((await post('/auth/register', { email: freshEmail(), password: 'short', displayName: 'X' })).status).toBe(400);
    expect((await post('/auth/register', { email: 'not-an-email', password: 'password123', displayName: 'X' })).status).toBe(400);
  });
});

describe('login and session', () => {
  it('logs in with correct credentials and /me returns the user', async () => {
    const { email, password } = await register();
    const res = await post('/auth/login', { email, password });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();

    const me = await get('/auth/me', cookie!);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  it('rejects a wrong password', async () => {
    const { email } = await register();
    const res = await post('/auth/login', { email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects /me without a session', async () => {
    expect((await get('/auth/me')).status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const { cookie } = await register();
    expect((await get('/auth/me', cookie)).status).toBe(200);
    const out = await post('/auth/logout', {}, cookie);
    expect(out.status).toBe(200);
    expect((await get('/auth/me', cookie)).status).toBe(401);
  });
});

describe('caching', () => {
  // Shipped bug: /auth/me had no Cache-Control, and a GET with no directives is heuristically
  // cacheable. Sign out, press back, and you look signed in until you refresh.
  it('never lets a session response be cached, signed in or out', async () => {
    const { cookie } = await register();

    for (const [label, res] of [
      ['signed in', await get('/auth/me', cookie!)],
      ['signed out', await get('/auth/me')],
    ] as const) {
      const cc = res.headers.get('cache-control') ?? '';
      expect(cc, `${label}: ${cc || '(no header)'}`).toContain('no-store');
    }
  });

  it('applies it to every auth route, not just the one that broke', async () => {
    // Anything under /auth depends on who is asking, so none of it is cacheable.
    for (const path of ['/auth/me', '/auth/sessions', '/auth/security-events']) {
      const cc = (await get(path)).headers.get('cache-control') ?? '';
      expect(cc, `${path}: ${cc || '(no header)'}`).toContain('no-store');
    }
  });
});

describe('profile', () => {
  it('updates the display name when authenticated, rejects when not', async () => {
    const { cookie } = await register();
    const ok = await post('/auth/update-profile', { displayName: 'Renamed' }, cookie);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { user: { displayName: string } }).user.displayName).toBe('Renamed');

    const me = await get('/auth/me', cookie);
    expect(((await me.json()) as { user: { displayName: string } }).user.displayName).toBe('Renamed');

    expect((await post('/auth/update-profile', { displayName: 'Nope' })).status).toBe(401);
  });
});

describe('email verification tokens', () => {
  it('verifies with a valid token and is single-use', async () => {
    const { id, cookie } = await register();
    const token = await issueToken(db(), id, 'verify');

    const res = await post('/auth/verify-email', { token });
    expect(res.status).toBe(200);
    const me = await get('/auth/me', cookie);
    expect(((await me.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);

    // Same token can't be replayed.
    expect((await post('/auth/verify-email', { token })).status).toBe(400);
  });
});

describe('password reset tokens', () => {
  it('resets the password, invalidates old sessions, and is single-use', async () => {
    const { id, email, password, cookie } = await register();
    const token = await issueToken(db(), id, 'reset');

    const res = await post('/auth/reset-password', { token, newPassword: 'brand-new-password' });
    expect(res.status).toBe(200);

    // Old password no longer works; new one does.
    expect((await post('/auth/login', { email, password })).status).toBe(401);
    expect((await post('/auth/login', { email, password: 'brand-new-password' })).status).toBe(200);

    // Reset revokes every existing session.
    expect((await get('/auth/me', cookie)).status).toBe(401);

    // Token is single-use.
    expect((await post('/auth/reset-password', { token, newPassword: 'another-one' })).status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const { id } = await register();
    const raw = crypto.randomUUID();
    await db().insert(authTokens).values({
      id: await hashToken(raw),
      userId: id,
      purpose: 'reset',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    expect((await post('/auth/reset-password', { token: raw, newPassword: 'whatever-password' })).status).toBe(400);
    // Expired token is consumed (deleted) on the attempt.
    const still = await db()
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.userId, id), eq(authTokens.purpose, 'reset')))
      .get();
    expect(still).toBeUndefined();
  });
});

describe('change password (logged in)', () => {
  it('changes with the correct current password, rotating sessions but keeping this device', async () => {
    const { email, password, cookie } = await register();
    const res = await post(
      '/auth/change-password',
      { currentPassword: password, newPassword: 'a-fresh-password' },
      cookie,
    );
    expect(res.status).toBe(200);
    const newCookie = sessionCookie(res);
    expect(newCookie).toBeTruthy();

    // Old session is revoked; the freshly issued one keeps this device signed in.
    expect((await get('/auth/me', cookie)).status).toBe(401);
    expect((await get('/auth/me', newCookie!)).status).toBe(200);

    // New password logs in; the old one no longer does.
    expect((await post('/auth/login', { email, password })).status).toBe(401);
    expect((await post('/auth/login', { email, password: 'a-fresh-password' })).status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const { cookie } = await register();
    const res = await post(
      '/auth/change-password',
      { currentPassword: 'not-my-password', newPassword: 'a-fresh-password' },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await post('/auth/change-password', { currentPassword: 'x', newPassword: 'a-fresh-password' });
    expect(res.status).toBe(401);
  });
});

describe('abuse controls', () => {
  it('rate-limits repeated login attempts with 429', async () => {
    const { email } = await register();
    let sawRateLimit = false;
    // login limit is 10 per 5 min per IP (tests share the "local" IP).
    for (let i = 0; i < 15; i++) {
      const res = await post('/auth/login', { email, password: 'wrong-password' });
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });

  it('does not reveal whether an account exists on forgot-password', async () => {
    const { email } = await register();
    const known = await post('/auth/forgot-password', { email });
    const unknown = await post('/auth/forgot-password', { email: freshEmail() });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());
  });
});

/** Create a Google-only (passwordless) account and a live session cookie for it. */
async function registerGoogle(): Promise<{ id: string; email: string; cookie: string }> {
  const id = crypto.randomUUID();
  const email = freshEmail();
  await db().insert(users).values({
    id,
    email,
    passwordHash: null,
    googleId: `g-${id}`,
    displayName: 'Google User',
    emailVerified: true,
  });
  const { token } = await createSession(db(), id);
  return { id, email, cookie: `platform_session=${token}` };
}

/** A GET that does not follow redirects, so the 302 + Set-Cookie can be inspected. */
async function getManual(path: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, { redirect: 'manual' });
}

describe('set password (passwordless account)', () => {
  it('lets a Google-only account add a password, then log in with it', async () => {
    const g = await registerGoogle();
    expect((await post('/auth/set-password', { newPassword: 'a-brand-new-password' }, g.cookie)).status).toBe(200);
    expect((await post('/auth/login', { email: g.email, password: 'a-brand-new-password' })).status).toBe(200);
  });

  it('refuses when the account already has a password', async () => {
    const { cookie } = await register();
    const res = await post('/auth/set-password', { newPassword: 'another-password' }, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('PASSWORD_EXISTS');
  });

  it('requires authentication', async () => {
    expect((await post('/auth/set-password', { newPassword: 'a-brand-new-password' })).status).toBe(401);
  });
});

describe('login for a Google-only account', () => {
  it('points the user at Google instead of checking a password', async () => {
    const g = await registerGoogle();
    const res = await post('/auth/login', { email: g.email, password: 'anything-at-all' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('USE_GOOGLE');
  });
});

describe('active sessions', () => {
  it('lists sessions, flags the current one, and signs out the others', async () => {
    const { email, password, cookie } = await register();
    const second = sessionCookie(await post('/auth/login', { email, password }));
    expect(second).toBeTruthy();

    const list = (await (await get('/auth/sessions', cookie)).json()) as {
      sessions: { id: string; current: boolean; expiresAt: string }[];
    };
    expect(list.sessions.length).toBe(2);
    expect(list.sessions.filter((s) => s.current).length).toBe(1);
    expect(list.sessions.every((session) => new Date(session.expiresAt).getTime() > Date.now())).toBe(true);

    expect((await post('/auth/sessions/revoke-others', {}, cookie)).status).toBe(200);
    expect((await get('/auth/me', cookie)).status).toBe(200); // current kept
    expect((await get('/auth/me', second!)).status).toBe(401); // other revoked
  });

  it('revokes only the caller-owned session (no cross-user revoke)', async () => {
    const a = await register();
    const b = await register();
    const bList = (await (await get('/auth/sessions', b.cookie)).json()) as { sessions: { id: string }[] };
    const bId = bList.sessions[0]!.id;
    // A tries to revoke B's session — scoped to A's own rows, so B stays signed in.
    expect((await post('/auth/sessions/revoke', { id: bId }, a.cookie)).status).toBe(200);
    expect((await get('/auth/me', b.cookie)).status).toBe(200);
  });

  it('renames only a caller-owned session and records the activity', async () => {
    const a = await register();
    const b = await register();
    const aList = (await (await get('/auth/sessions', a.cookie)).json()) as { sessions: { id: string }[] };
    const bList = (await (await get('/auth/sessions', b.cookie)).json()) as { sessions: { id: string; device: string | null }[] };
    const aId = aList.sessions[0]!.id;
    const bId = bList.sessions[0]!.id;

    const renamed = await post('/auth/sessions/rename', { id: aId, label: '  Personal MacBook  ' }, a.cookie);
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { session: { device: string } }).session.device).toBe('Personal MacBook');

    const refreshed = (await (await get('/auth/sessions', a.cookie)).json()) as { sessions: { id: string; device: string | null }[] };
    expect(refreshed.sessions.find((session) => session.id === aId)?.device).toBe('Personal MacBook');
    const activity = (await (await get('/auth/security-events', a.cookie)).json()) as { events: { type: string }[] };
    expect(activity.events.some((event) => event.type === 'device_renamed')).toBe(true);

    expect((await post('/auth/sessions/rename', { id: bId, label: 'Not mine' }, a.cookie)).status).toBe(404);
    const bRefreshed = (await (await get('/auth/sessions', b.cookie)).json()) as { sessions: { id: string; device: string | null }[] };
    expect(bRefreshed.sessions.find((session) => session.id === bId)?.device).toBe(bList.sessions[0]!.device);
  });

  it('validates session names and requires authentication', async () => {
    const a = await register();
    const list = (await (await get('/auth/sessions', a.cookie)).json()) as { sessions: { id: string }[] };
    const id = list.sessions[0]!.id;
    expect((await post('/auth/sessions/rename', { id, label: '   ' }, a.cookie)).status).toBe(400);
    expect((await post('/auth/sessions/rename', { id, label: 'x'.repeat(41) }, a.cookie)).status).toBe(400);
    expect((await post('/auth/sessions/rename', { id, label: 'My device' })).status).toBe(401);
  });

  it('requires authentication', async () => {
    expect((await get('/auth/sessions')).status).toBe(401);
  });
});

describe('security activity', () => {
  it('lists only the signed-in user’s recent account events', async () => {
    const a = await register();
    const b = await register();
    await post('/auth/login', { email: a.email, password: a.password });

    const response = await get('/auth/security-events', a.cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: { type: string; device: string | null; createdAt: string }[];
    };
    expect(body.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['account_created', 'signed_in']),
    );
    expect(body.events).toHaveLength(2);
    expect(body.events.every((event) => !Number.isNaN(Date.parse(event.createdAt)))).toBe(true);

    const other = (await (await get('/auth/security-events', b.cookie)).json()) as { events: unknown[] };
    expect(other.events).toHaveLength(1);
  });

  it('records password changes and device sign-outs but ignores cross-account revoke attempts', async () => {
    const a = await register();
    const b = await register();
    const bSessions = (await (await get('/auth/sessions', b.cookie)).json()) as { sessions: { id: string }[] };

    await post('/auth/sessions/revoke', { id: bSessions.sessions[0]!.id }, a.cookie);
    const unchanged = (await (await get('/auth/security-events', a.cookie)).json()) as {
      events: { type: string }[];
    };
    expect(unchanged.events.map((event) => event.type)).not.toContain('device_signed_out');

    const changed = await post(
      '/auth/change-password',
      { currentPassword: a.password, newPassword: 'new-secure-password' },
      a.cookie,
    );
    const newCookie = sessionCookie(changed);
    expect(newCookie).toBeTruthy();
    const activity = (await (await get('/auth/security-events', newCookie!)).json()) as {
      events: { type: string }[];
    };
    expect(activity.events.map((event) => event.type)).toContain('password_changed');
  });

  it('requires authentication', async () => {
    expect((await get('/auth/security-events')).status).toBe(401);
  });
});

describe('account data export', () => {
  it('exports only the signed-in account without credentials or session identifiers', async () => {
    const a = await register();
    const b = await register();
    await post('/auth/login', { email: a.email, password: a.password });

    const response = await get('/auth/export', a.cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      account: { email: string; signInMethods: string[] };
      activeSessions: Array<Record<string, unknown>>;
      securityActivity: Array<{ type: string }>;
    };
    expect(body.account.email).toBe(a.email);
    expect(body.account.email).not.toBe(b.email);
    expect(body.account.signInMethods).toContain('password');
    expect(body.activeSessions.length).toBeGreaterThan(0);
    expect(body.activeSessions.every((session) => !('id' in session))).toBe(true);
    expect(body.securityActivity.some((event) => event.type === 'account_created')).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('googleId');
  });

  it('requires authentication', async () => {
    expect((await get('/auth/export')).status).toBe(401);
  });
});

describe('disconnect Google', () => {
  it('refuses to unlink when it would leave no way to sign in', async () => {
    const g = await registerGoogle();
    const res = await post('/auth/disconnect-google', {}, g.cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('CANNOT_UNLINK');
  });

  it('unlinks once a password exists', async () => {
    const g = await registerGoogle();
    const added = await post('/auth/set-password', { newPassword: 'safe-enough-password' }, g.cookie);
    expect(added.status).toBe(200);
    // set-password signs every other session out and re-issues this one, so the original cookie is
    // deliberately dead by now. Carry the replacement.
    const rotated = sessionCookie(added);
    expect(rotated).toBeTruthy();
    expect((await post('/auth/disconnect-google', {}, rotated!)).status).toBe(200);
  });
});

describe('magic-link sign-in', () => {
  it('does not reveal whether an account exists', async () => {
    const { email } = await register();
    const known = await post('/auth/magic-link', { email });
    const unknown = await post('/auth/magic-link', { email: freshEmail() });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());
  });

  it('signs in via a valid token and is single-use', async () => {
    const { id } = await register();
    const token = await issueToken(db(), id, 'magic');
    const res = await getManual(`/auth/magic/callback?token=${token}`);
    expect(res.status).toBe(302);
    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    expect((await get('/auth/me', cookie!)).status).toBe(200);

    // Replaying the same token fails and bounces to the login page.
    const replay = await getManual(`/auth/magic/callback?token=${token}`);
    expect(replay.headers.get('location')).toContain('error=magic_failed');
  });

  it('rejects a missing/invalid token', async () => {
    const res = await getManual('/auth/magic/callback?token=not-a-real-token');
    expect(res.headers.get('location')).toContain('error=magic_failed');
  });
});

describe('delete account', () => {
  it('deletes with the correct password and blocks login afterward', async () => {
    const { email, password, cookie } = await register();
    expect((await post('/auth/delete-account', { password: 'wrong-password' }, cookie)).status).toBe(400);
    expect((await post('/auth/delete-account', { password }, cookie)).status).toBe(200);
    expect((await get('/auth/me', cookie)).status).toBe(401);
    expect((await post('/auth/login', { email, password })).status).toBe(401);
  });

  it('deletes a Google-only account when the typed email confirms', async () => {
    const g = await registerGoogle();
    expect((await post('/auth/delete-account', { confirm: 'nope@wrong.dev' }, g.cookie)).status).toBe(400);
    expect((await post('/auth/delete-account', { confirm: g.email }, g.cookie)).status).toBe(200);
    expect((await get('/auth/me', g.cookie)).status).toBe(401);
  });

  it('requires authentication', async () => {
    expect((await post('/auth/delete-account', { password: 'x' })).status).toBe(401);
  });
});

/*
 * Step-up re-authentication.
 *
 * The bug these cover is a chain, not a single call. set-password used to accept a live cookie as
 * the whole proof of ownership (a Google-only account has no current password to ask for), and
 * disconnect-google is allowed as soon as a password exists (so nobody is left unable to sign in).
 * Run in order from a stolen cookie that is: give the account a password the thief knows, cut the
 * Google link the owner uses, and the owner is locked out of their own account.
 *
 * Each step was defensible. So these tests assert the chain, not the steps.
 */
describe('step-up re-authentication', () => {
  /** Age a session past the sudo window, the way a cookie stolen from a closed laptop would be. */
  async function makeStale(cookie: string): Promise<void> {
    const raw = cookie.split('=')[1]!;
    await db()
      .update(sessions)
      .set({ reauthAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(sessions.id, await hashToken(raw)));
  }

  it('blocks the lockout chain at its first step when the cookie is old', async () => {
    const g = await registerGoogle();
    await makeStale(g.cookie);

    const res = await post('/auth/set-password', { newPassword: 'attacker-chosen-pass' }, g.cookie);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; canUsePassword: boolean };
    expect(body.error).toBe('REAUTH_REQUIRED');
    // Nothing to type on a passwordless account, so the UI must not offer a password prompt.
    expect(body.canUsePassword).toBe(false);

    // And the account is untouched: still no password, so Google cannot be unlinked either.
    const unlink = await post('/auth/disconnect-google', {}, g.cookie);
    expect(unlink.status).toBe(400);
    expect(((await unlink.json()) as { error: string }).error).toBe('CANNOT_UNLINK');
  });

  it('blocks unlinking Google on an old session, and says a password will do', async () => {
    const g = await registerGoogle();
    const added = await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie);
    const rotated = sessionCookie(added)!;
    await makeStale(rotated);

    const res = await post('/auth/disconnect-google', {}, rotated);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; canUsePassword: boolean };
    expect(body.error).toBe('REAUTH_REQUIRED');
    expect(body.canUsePassword).toBe(true);
  });

  it('lets a password re-open the window, and then the action goes through', async () => {
    const g = await registerGoogle();
    const added = await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie);
    const rotated = sessionCookie(added)!;
    await makeStale(rotated);
    expect((await post('/auth/disconnect-google', {}, rotated)).status).toBe(403);

    const re = await post('/auth/reauth', { password: 'a-real-password-now' }, rotated);
    expect(re.status).toBe(200);
    expect(((await re.json()) as { sudoUntil: string | null }).sudoUntil).toBeTruthy();

    expect((await post('/auth/disconnect-google', {}, rotated)).status).toBe(200);
  });

  it('does not re-open the window for a wrong password', async () => {
    const { cookie } = await register();
    await makeStale(cookie);
    const res = await post('/auth/reauth', { password: 'not-the-password' }, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_CREDENTIALS');
  });

  it('tells a passwordless account there is nothing to confirm with', async () => {
    const g = await registerGoogle();
    const res = await post('/auth/reauth', { password: 'anything' }, g.cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('NO_PASSWORD');
  });

  it('treats a freshly signed-in session as already confirmed', async () => {
    const { email, password } = await register();
    const cookie = sessionCookie(await post('/auth/login', { email, password }))!;
    // No reauth call: signing in was the proof, so a sensitive action works immediately.
    const me = await get('/auth/me', cookie);
    expect(((await me.json()) as { sudoUntil: string | null }).sudoUntil).toBeTruthy();
  });

  it('reports the window as lapsed on an old session', async () => {
    const { cookie } = await register();
    await makeStale(cookie);
    const me = await get('/auth/me', cookie);
    expect(((await me.json()) as { sudoUntil: string | null }).sudoUntil).toBeNull();
  });

  /*
   * The two sensitive-looking routes deliberately left open, asserted so nobody "fixes" them later.
   * Both are what a victim reaches for, and a password prompt there slows down the wrong person.
   */
  it('still signs other devices out on an old session, because that is self-defence', async () => {
    const { email, password, cookie } = await register();
    expect(sessionCookie(await post('/auth/login', { email, password }))).toBeTruthy();
    await makeStale(cookie);
    expect((await post('/auth/sessions/revoke-others', {}, cookie)).status).toBe(200);
  });

  it('still deletes an account on an old session, since the password is its own proof', async () => {
    const { password, cookie } = await register();
    await makeStale(cookie);
    expect((await post('/auth/delete-account', { password }, cookie)).status).toBe(200);
  });
});

describe('session hygiene on credential changes', () => {
  it('signs other devices out when a password is added', async () => {
    const g = await registerGoogle();
    const other = (await createSession(db(), g.id)).token;
    const otherCookie = `platform_session=${other}`;
    expect((await get('/auth/me', otherCookie)).status).toBe(200);

    const added = await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie);
    expect(added.status).toBe(200);

    // The other device is gone, and the device that made the change is still signed in.
    expect((await get('/auth/me', otherCookie)).status).toBe(401);
    expect((await get('/auth/me', sessionCookie(added)!)).status).toBe(200);
  });

  it('signs other devices out when Google is unlinked', async () => {
    const g = await registerGoogle();
    const rotated = sessionCookie(
      await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie),
    )!;
    const otherCookie = `platform_session=${(await createSession(db(), g.id)).token}`;
    expect((await get('/auth/me', otherCookie)).status).toBe(200);

    const unlinked = await post('/auth/disconnect-google', {}, rotated);
    expect(unlinked.status).toBe(200);
    expect((await get('/auth/me', otherCookie)).status).toBe(401);
    expect((await get('/auth/me', sessionCookie(unlinked)!)).status).toBe(200);
  });

  it('records what happened in the security activity log', async () => {
    const g = await registerGoogle();
    const rotated = sessionCookie(
      await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie),
    )!;
    // Unlinking rotates the cookie too, so read the log with the one it hands back.
    const final = sessionCookie(await post('/auth/disconnect-google', {}, rotated))!;

    const res = await get('/auth/security-events', final);
    const { events } = (await res.json()) as { events: { type: string }[] };
    const types = events.map((e) => e.type);
    expect(types).toContain('password_added');
    expect(types).toContain('google_disconnected');
  });
});

/*
 * A missing column must not take the platform down.
 *
 * This is the postmortem of a real outage, written as a test. The code that added `reauth_at` was
 * deployed before the migration ran, so the freshness query referenced a column production did not
 * have. Every session-creating route answered 500, and so did /auth/me, which every app calls to
 * resolve identity. A step-up convenience became a total sign-in outage.
 *
 * The read path now degrades instead: it cannot vouch for the session, so the session is treated as
 * unproven and sensitive actions ask for a password again. Asking more often is the safe direction to
 * fail in; the whole service being down is not.
 */
describe('surviving a schema that is behind the code', () => {
  it('still answers /auth/me when the freshness column is missing', async () => {
    const { cookie } = await register();
    // Exactly what production looked like: the code expects the column, the table does not have it.
    await env.DB.prepare('ALTER TABLE sessions DROP COLUMN reauth_at').run();
    try {
      const res = await get('/auth/me', cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { email: string }; sudoUntil: string | null };
      expect(body.user.email).toBeTruthy();
      // Unknown rather than fresh, which is what makes the degrade safe.
      expect(body.sudoUntil).toBeNull();
    } finally {
      await env.DB.prepare('ALTER TABLE sessions ADD reauth_at integer').run();
    }
  });

  it('asks for a password rather than letting a sensitive action through', async () => {
    const g = await registerGoogle();
    const added = await post('/auth/set-password', { newPassword: 'a-real-password-now' }, g.cookie);
    const rotated = sessionCookie(added)!;
    await env.DB.prepare('ALTER TABLE sessions DROP COLUMN reauth_at').run();
    try {
      const res = await post('/auth/disconnect-google', {}, rotated);
      // Not a 500, and not a silent pass either.
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe('REAUTH_REQUIRED');
    } finally {
      await env.DB.prepare('ALTER TABLE sessions ADD reauth_at integer').run();
    }
  });
});

/*
 * Passkeys.
 *
 * The signature checking is @simplewebauthn's and is not re-tested here. What is mine, and therefore
 * what these cover, is the policy around it: who may start a ceremony, that a challenge is good exactly
 * once, that a credential belongs to somebody, and that starting a sign-in tells an anonymous caller
 * nothing about whether an account exists.
 */
describe('passkeys', () => {
  /** A credential row without a real authenticator, for the management paths. */
  async function seedPasskey(userId: string, label = 'Test key'): Promise<string> {
    const id = `cred-${crypto.randomUUID()}`;
    await db().insert(credentials).values({
      id,
      userId,
      publicKey: Buffer.from('not-a-real-key').toString('base64'),
      counter: 0,
      backedUp: true,
      label,
    });
    return id;
  }

  it('needs a session to start registering one', async () => {
    expect((await post('/auth/passkeys/register/options', {})).status).toBe(401);
    expect((await get('/auth/passkeys')).status).toBe(401);
  });

  it('hands back options and a challenge cookie', async () => {
    const { cookie } = await register();
    const res = await post('/auth/passkeys/register/options', {}, cookie);
    expect(res.status).toBe(200);

    const { options } = (await res.json()) as {
      options: { challenge: string; rp: { id: string }; authenticatorSelection: { residentKey: string } };
    };
    expect(options.challenge).toBeTruthy();
    // Discoverable, or "sign in" could not work without typing an email first.
    expect(options.authenticatorSelection.residentKey).toBe('required');
    expect(res.headers.getSetCookie().some((c) => c.startsWith('platform_webauthn='))).toBe(true);
  });

  /*
   * Single use is the property that stops a captured response being replayed. The row is deleted when
   * it is read, whether or not verification then succeeds, so a failed attempt also burns its challenge
   * and nobody gets to grind guesses against one.
   */
  it('spends a challenge even on a failed attempt', async () => {
    const { cookie } = await register();
    const optionsRes = await post('/auth/passkeys/register/options', {}, cookie);
    const challengeCookie = optionsRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('platform_webauthn='))!
      .split(';')[0]!;

    const body = { response: { id: 'nope', rawId: 'nope', type: 'public-key', response: {} } };
    const first = await post('/auth/passkeys/register/verify', body, `${cookie}; ${challengeCookie}`);
    expect(first.status).toBe(400);

    const second = await post('/auth/passkeys/register/verify', body, `${cookie}; ${challengeCookie}`);
    expect(((await second.json()) as { error: string }).error).toBe('NO_CHALLENGE');
  });

  it("will not let one account finish another account's ceremony", async () => {
    const a = await register();
    const b = await register();
    const optionsRes = await post('/auth/passkeys/register/options', {}, a.cookie);
    const challengeCookie = optionsRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('platform_webauthn='))!
      .split(';')[0]!;

    // b presents a's challenge. Without the owner check this would bind a key to the wrong account.
    const res = await post(
      '/auth/passkeys/register/verify',
      { response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } },
      `${b.cookie}; ${challengeCookie}`,
    );
    expect(((await res.json()) as { error: string }).error).toBe('NO_CHALLENGE');
  });

  it('offers sign-in options to anyone, revealing nothing', async () => {
    // No email goes in, so the response cannot differ by whether an account exists. Any difference here
    // would turn the sign-in page into an account-enumeration oracle.
    const first = await post('/auth/passkeys/login/options', {});
    const second = await post('/auth/passkeys/login/options', {});
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const a = (await first.json()) as { options: Record<string, unknown> };
    const b = (await second.json()) as { options: Record<string, unknown> };
    expect(Object.keys(a.options).sort()).toEqual(Object.keys(b.options).sort());
    // Fresh challenge each time, or it would not be a challenge.
    expect(a.options.challenge).not.toBe(b.options.challenge);
  });

  it('refuses a credential it has never seen', async () => {
    const optionsRes = await post('/auth/passkeys/login/options', {});
    const challengeCookie = optionsRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('platform_webauthn='))!
      .split(';')[0]!;
    const res = await post(
      '/auth/passkeys/login/verify',
      { response: { id: 'never-registered', rawId: 'never-registered', type: 'public-key', response: {} } },
      challengeCookie,
    );
    expect(((await res.json()) as { error: string }).error).toBe('UNKNOWN_CREDENTIAL');
  });

  it('fails verification for a known credential with a bogus signature', async () => {
    // Proves the library is actually wired in rather than the route waving things through.
    const { id, cookie } = await register();
    const credId = await seedPasskey(id);
    const optionsRes = await post('/auth/passkeys/login/options', {});
    const challengeCookie = optionsRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('platform_webauthn='))!
      .split(';')[0]!;

    const res = await post(
      '/auth/passkeys/login/verify',
      { response: { id: credId, rawId: credId, type: 'public-key', response: { signature: 'AAAA' } } },
      challengeCookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VERIFICATION_FAILED');
    expect(cookie).toBeTruthy();
  });

  it('lists only your own passkeys', async () => {
    const mine = await register();
    const theirs = await register();
    await seedPasskey(mine.id, 'My laptop');
    await seedPasskey(theirs.id, 'Their phone');

    const res = await get('/auth/passkeys', mine.cookie);
    const { passkeys } = (await res.json()) as { passkeys: { label: string }[] };
    expect(passkeys.map((p) => p.label)).toEqual(['My laptop']);
  });

  it("will not rename or remove somebody else's passkey", async () => {
    const mine = await register();
    const theirs = await register();
    const victim = await seedPasskey(theirs.id, 'Their phone');

    expect((await post('/auth/passkeys/rename', { id: victim, label: 'Mine now' }, mine.cookie)).status).toBe(404);
    expect((await post('/auth/passkeys/delete', { id: victim }, mine.cookie)).status).toBe(404);

    const still = await get('/auth/passkeys', theirs.cookie);
    expect(((await still.json()) as { passkeys: unknown[] }).passkeys).toHaveLength(1);
  });

  it('renames your own', async () => {
    const { id, cookie } = await register();
    const credId = await seedPasskey(id, 'Old name');
    expect((await post('/auth/passkeys/rename', { id: credId, label: 'MacBook' }, cookie)).status).toBe(200);
    const { passkeys } = (await (await get('/auth/passkeys', cookie)).json()) as { passkeys: { label: string }[] };
    expect(passkeys[0]?.label).toBe('MacBook');
  });

  it('removes one, and records it', async () => {
    const { id, cookie } = await register();
    const credId = await seedPasskey(id);
    expect((await post('/auth/passkeys/delete', { id: credId }, cookie)).status).toBe(200);
    expect(((await (await get('/auth/passkeys', cookie)).json()) as { passkeys: unknown[] }).passkeys).toHaveLength(0);

    const events = (await (await get('/auth/security-events', cookie)).json()) as { events: { type: string }[] };
    expect(events.events.map((e) => e.type)).toContain('passkey_removed');
  });

  /*
   * Removing a passkey changes how you sign in, so it sits behind the same freshness gate as unlinking
   * Google. A cookie lifted from a closed laptop must not be able to strip the owner's keys.
   */
  it('asks for confirmation before removing one on an old session', async () => {
    const { id, cookie } = await register();
    const credId = await seedPasskey(id);
    const raw = cookie.split('=')[1]!;
    await db()
      .update(sessions)
      .set({ reauthAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(sessions.id, await hashToken(raw)));

    const res = await post('/auth/passkeys/delete', { id: credId }, cookie);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('REAUTH_REQUIRED');
    // And it is still there.
    expect(((await (await get('/auth/passkeys', cookie)).json()) as { passkeys: unknown[] }).passkeys).toHaveLength(1);
  });
});
