import { fetchMock } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyTurnstile } from '../src/turnstile.js';

const SITEVERIFY = 'https://challenges.cloudflare.com';

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

/** Intercept siteverify, capturing the form Cloudflare would have received. */
function expectSiteverify(reply: unknown, status = 200): { body: () => string } {
  let captured = '';
  fetchMock
    .get(SITEVERIFY)
    .intercept({
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      body: (b) => {
        captured = String(b);
        return true;
      },
    })
    .reply(status, reply);
  return { body: () => captured };
}

describe('the bot challenge', () => {
  it('passes a token Cloudflare accepts', async () => {
    expectSiteverify({ success: true });
    expect(await verifyTurnstile('secret', 'token')).toBe(true);
  });

  it('fails a token Cloudflare rejects', async () => {
    expectSiteverify({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifyTurnstile('secret', 'token')).toBe(false);
  });

  /* Closed, not open. A siteverify outage must not become a way to skip the challenge. */
  it('fails closed when siteverify itself errors', async () => {
    expectSiteverify({}, 500);
    expect(await verifyTurnstile('secret', 'token')).toBe(false);
  });

  it('fails on a response that omits success rather than assuming it', async () => {
    expectSiteverify({ 'error-codes': [] });
    expect(await verifyTurnstile('secret', 'token')).toBe(false);
  });

  it('will not take a truthy non-true success', async () => {
    expectSiteverify({ success: 'yes' });
    expect(await verifyTurnstile('secret', 'token')).toBe(false);
  });

  it('sends the secret and the token it was given', async () => {
    const form = expectSiteverify({ success: true });
    await verifyTurnstile('the-secret', 'the-token');
    expect(form.body()).toContain('the-secret');
    expect(form.body()).toContain('the-token');
  });

  /*
   * Cloudflare rejects a remoteip that is not an address, which would fail a perfectly good token.
   * Under `wrangler dev` there is no cf-connecting-ip and callers pass a placeholder, so anything
   * without a dot or colon is left off entirely rather than sent and refused.
   */
  it('forwards a real address', async () => {
    const form = expectSiteverify({ success: true });
    await verifyTurnstile('secret', 'token', '203.0.113.7');
    expect(form.body()).toContain('203.0.113.7');
  });

  it('forwards an ipv6 address', async () => {
    const form = expectSiteverify({ success: true });
    await verifyTurnstile('secret', 'token', '2001:db8::1');
    expect(form.body()).toContain('2001:db8::1');
  });

  it('leaves out a dev placeholder that is not an address', async () => {
    const form = expectSiteverify({ success: true });
    await verifyTurnstile('secret', 'token', 'local');
    expect(form.body()).not.toContain('remoteip');
  });
});
