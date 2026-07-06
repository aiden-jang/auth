import { SELF, env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { authTokens, users } from '../src/db/schema.js';
import { issueToken } from '../src/auth/verification.js';
import { hashToken } from '../src/auth/token.js';
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
