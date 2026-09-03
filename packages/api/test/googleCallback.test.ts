import { createExecutionContext, env, fetchMock, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index.js';
import { createDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const testEnv = env as unknown as Env;
const db = () => createDb(testEnv);

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const BASE = 'https://auth.test';

/*
 * Google is switched off across the rest of the suite (empty credentials, so the route bails at
 * not_configured). These tests turn it on for the duration and intercept the token endpoint, which
 * is the only way to reach the code that decides who a callback signs in.
 */
const googleEnv = (): Env => ({
  ...testEnv,
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-secret',
});

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

function b64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An id_token shaped the way Google's token endpoint returns one. Only the payload is read. */
function idToken(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'RS256' })}.${b64url({ aud: CLIENT_ID, ...claims })}.sig`;
}

function expectTokenExchange(claims: Record<string, unknown>): void {
  fetchMock
    .get('https://oauth2.googleapis.com')
    .intercept({ path: '/token', method: 'POST' })
    .reply(200, { id_token: idToken(claims) });
}

/** Drive the callback the way Google does: the state cookie the app set, plus code and state. */
async function callback(state = 'st_1', savedState = state): Promise<Response> {
  const cookie = `g_oauth=${encodeURIComponent(JSON.stringify({ s: savedState, r: '' }))}`;
  const request = new Request(`${BASE}/auth/google/callback?code=abc&state=${state}`, {
    headers: { cookie },
  });
  const ctx = createExecutionContext();
  const res = await app.fetch(request, googleEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const reason = (res: Response): string | null =>
  new URL(res.headers.get('location') ?? BASE).searchParams.get('reason');

const signedIn = (res: Response): boolean =>
  res.headers.getSetCookie().some((c) => /platform_session=[^;]+/.test(c));

let n = 0;
const freshEmail = () => `cb-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`;

describe('the Google callback', () => {
  it('signs in a verified identity', async () => {
    const email = freshEmail();
    expectTokenExchange({ sub: 'g-1', email, email_verified: true, name: 'Verified' });
    const res = await callback();
    expect(signedIn(res)).toBe(true);
  });

  /*
   * The account-takeover path. An unverified address that matches an existing account must not
   * reach it, and the refusal has to happen here too: the route, not just the lookup, is what
   * decides whether a session gets created.
   */
  it('refuses an unverified address and creates no session', async () => {
    const email = freshEmail();
    const victimId = crypto.randomUUID();
    await db().insert(users).values({
      id: victimId,
      email,
      passwordHash: 'pbkdf2$1$salt$hash',
      googleId: null,
      displayName: 'Owner',
      emailVerified: true,
    });

    expectTokenExchange({ sub: 'attacker', email, email_verified: false, name: 'Attacker' });
    const res = await callback();

    expect(signedIn(res)).toBe(false);
    expect(reason(res)).toBe('email_unverified');
    const row = await db().select().from(users).where(eq(users.id, victimId)).get();
    expect(row?.googleId).toBeNull();
  });

  it('names the refusal rather than reporting a generic failure', async () => {
    expectTokenExchange({
      sub: 'g-2',
      email: freshEmail(),
      email_verified: false,
      name: 'Nobody',
    });
    expect(reason(await callback())).toBe('email_unverified');
  });

  /*
   * The OAuth CSRF defence. Without it an attacker can hand somebody a callback URL carrying their
   * own code, and the victim ends up signed into the attacker's Google account -- where anything
   * they then save belongs to the attacker.
   */
  it('refuses a state that does not match the one it issued', async () => {
    const res = await callback('forged', 'st_real');
    expect(signedIn(res)).toBe(false);
    expect(reason(res)).toBe('state_mismatch');
  });

  it('refuses a callback arriving with no state cookie at all', async () => {
    const request = new Request(`${BASE}/auth/google/callback?code=abc&state=st_1`);
    const ctx = createExecutionContext();
    const res = await app.fetch(request, googleEnv(), ctx);
    await waitOnExecutionContext(ctx);
    expect(signedIn(res)).toBe(false);
    expect(reason(res)).toBe('no_state_cookie');
  });

  /*
   * The id_token is trusted on the strength of coming straight from Google over TLS, so the
   * audience is the one thing proving it was minted for this client and not replayed from another.
   */
  it('refuses an id_token minted for a different client', async () => {
    fetchMock
      .get('https://oauth2.googleapis.com')
      .intercept({ path: '/token', method: 'POST' })
      .reply(200, {
        id_token: `${b64url({ alg: 'RS256' })}.${b64url({
          aud: 'someone-elses-client.apps.googleusercontent.com',
          sub: 'g-3',
          email: freshEmail(),
          email_verified: true,
        })}.sig`,
      });
    const res = await callback();
    expect(signedIn(res)).toBe(false);
    expect(reason(res)).toBe('token_exchange');
  });
});
