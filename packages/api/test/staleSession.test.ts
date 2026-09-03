import { SELF, env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/token.js';
import { createDb } from '../src/db/client.js';
import { sessions, users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const db = () => createDb(env as unknown as Env);
const BASE = 'https://auth.test';
const json = { 'content-type': 'application/json' };

let n = 0;

interface Account {
  email: string;
  cookie: string;
  token: string;
}

async function register(): Promise<Account> {
  const email = `stale-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`;
  const res = await SELF.fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password: 'correct horse battery', displayName: 'Owner' }),
  });
  expect(res.status).toBe(201);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => /(platform_session=[^;]+)/.exec(c)?.[1])
    .find(Boolean)!;
  return { email, cookie, token: cookie.split('=')[1]! };
}

/** Age a session past the step-up window, the way a cookie stolen hours ago would be. */
async function goStale(token: string): Promise<void> {
  await db()
    .update(sessions)
    .set({ reauthAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(sessions.id, await hashToken(token)));
}

const post = (path: string, body: unknown, cookie: string) =>
  SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...json, cookie },
    body: JSON.stringify(body),
  });

const errorOf = async (res: Response): Promise<string> =>
  /"error":"([A-Z_]+)"/.exec(await res.text())?.[1] ?? 'none';

/*
 * A session cookie proves who you were when you signed in, not that you are still at the keyboard.
 * Anything that changes how the account can be signed into afterwards has to ask again, or a cookie
 * lifted hours ago is as good as the password.
 */
describe('what a stale session may still do', () => {
  let account: Account;
  beforeEach(async () => {
    account = await register();
    await goStale(account.token);
  });

  /*
   * Adding a passkey is the one that outlives the clean-up. Changing a password revokes every
   * session, but it does not remove credentials -- so a passkey an attacker registered still signs
   * them in afterwards. It has to be gated at least as tightly as removing one.
   */
  it('may not begin registering a passkey', async () => {
    const res = await post('/auth/passkeys/register/options', {}, account.cookie);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('REAUTH_REQUIRED');
  });

  // The write path, gated on its own: the options call is convenience, this is enforcement.
  it('may not finish registering a passkey', async () => {
    const res = await post(
      '/auth/passkeys/register/verify',
      { response: { id: 'anything' } },
      account.cookie,
    );
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('REAUTH_REQUIRED');
  });

  it('may not remove a passkey', async () => {
    const res = await post('/auth/passkeys/delete', { id: 'cred_x' }, account.cookie);
    expect(await errorOf(res)).toBe('REAUTH_REQUIRED');
  });

  /* Ordinary use is not sensitive, and gating it would make the window a nuisance rather than a
     defence. */
  it('may still read and rename, which change nothing about signing in', async () => {
    expect(
      (await SELF.fetch(`${BASE}/auth/me`, { headers: { cookie: account.cookie } })).status,
    ).toBe(200);
    expect(
      (await post('/auth/update-profile', { displayName: 'Still Me' }, account.cookie)).status,
    ).toBe(200);
  });

  it('lets a session that just proved itself add one again', async () => {
    const proved = await post(
      '/auth/reauth',
      { password: 'correct horse battery' },
      account.cookie,
    );
    expect(proved.status).toBe(200);
    const res = await post('/auth/passkeys/register/options', {}, account.cookie);
    expect(res.status).toBe(200);
  });
});

/*
 * Deleting a passwordless account asked only that you retype its email address, which anyone
 * holding the cookie reads straight off /auth/me. Every lesser change to that account -- setting a
 * password, unlinking Google -- already asks it to prove itself first.
 */
describe('deleting a passwordless account', () => {
  it('is refused by a stale session even with the right email typed', async () => {
    const account = await register();
    await db()
      .update(users)
      .set({ passwordHash: null, googleId: 'g-sub-stale' })
      .where(eq(users.email, account.email));
    await goStale(account.token);

    const res = await post('/auth/delete-account', { confirm: account.email }, account.cookie);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('REAUTH_REQUIRED');

    const still = await db().select().from(users).where(eq(users.email, account.email)).get();
    expect(still).toBeDefined();
  });

  it('still needs the email typed, even when the session is fresh', async () => {
    const account = await register();
    await db()
      .update(users)
      .set({ passwordHash: null, googleId: 'g-sub-fresh' })
      .where(eq(users.email, account.email));

    const res = await post('/auth/delete-account', { confirm: 'wrong@test.dev' }, account.cookie);
    expect(await errorOf(res)).toBe('CONFIRM_MISMATCH');
  });
});

/*
 * Every other route that sends mail is capped. This one was not, so a loop through it was unbounded
 * outbound email on the account's own address: quota and sender reputation, not a takeover.
 */
describe('asking for another verification email', () => {
  it('stops after a handful in the window', async () => {
    const account = await register();
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push((await post('/auth/resend-verification', {}, account.cookie)).status);
    }
    expect(codes).toContain(429);
  });
});
