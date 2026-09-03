import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const BASE = 'https://auth.test';

/*
 * The two refusal codes, pinned.
 *
 * Six apps and the SPA switch on `error` to decide whether to send someone to sign in or to back
 * off and retry. Renaming one is not a type error anywhere in this repo, and the status code alone
 * -- which is all the route tests checked -- stays identical while every caller stops matching.
 */
describe('the codes a refusal is identified by', () => {
  it('says UNAUTHENTICATED when there is no session', async () => {
    const res = await SELF.fetch(`${BASE}/auth/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('says the same for a cookie that no longer resolves', async () => {
    const res = await SELF.fetch(`${BASE}/auth/me`, {
      headers: { cookie: 'platform_session=long-since-revoked' },
    });
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('says RATE_LIMITED, with something a person can read, once a limit trips', async () => {
    let body: { error?: string; message?: string } = {};
    for (let i = 0; i < 12; i++) {
      const res = await SELF.fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' },
        body: JSON.stringify({ email: 'nobody@test.dev', password: 'wrong' }),
      });
      if (res.status === 429) {
        body = await res.json();
        break;
      }
    }
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.message).toMatch(/try again/i);
  });
});
