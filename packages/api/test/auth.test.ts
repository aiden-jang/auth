import { SELF, env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { authTokens, users } from '../src/db/schema.js';
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
  /*
   * A shipped bug: /auth/me had no Cache-Control, and a GET with no directives is heuristically
   * cacheable. Sign out, press back, the page re-checks the session, the browser answers from its own
   * cache, and you look signed in until you refresh. A missing header is invisible in every other kind
   * of test, so it needs its own.
   */
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
    expect((await post('/auth/set-password', { newPassword: 'safe-enough-password' }, g.cookie)).status).toBe(200);
    expect((await post('/auth/disconnect-google', {}, g.cookie)).status).toBe(200);
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
