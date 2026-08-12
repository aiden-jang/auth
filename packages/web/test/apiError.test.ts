import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, authApi, isReauthRequired, reauthCanUsePassword } from '../src/lib/api';

/*
 * The step-up flow branches on the server's error code, so this guards that seam. Matching on the
 * prose instead breaks silently the first time somebody rewords a sentence.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stub(status: number, body: unknown): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('api errors', () => {
  it('keeps the error code across the transport, not just the message', async () => {
    stub(403, {
      error: 'REAUTH_REQUIRED',
      message: 'Confirm your password to continue.',
      canUsePassword: true,
    });

    const err = await authApi.disconnectGoogle().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isReauthRequired(err)).toBe(true);
    expect(reauthCanUsePassword(err)).toBe(true);
    expect((err as ApiError).status).toBe(403);
  });

  it('reports when the account has no password to confirm with', async () => {
    stub(403, { error: 'REAUTH_REQUIRED', message: 'Sign in with Google again.', canUsePassword: false });
    const err = await authApi.disconnectGoogle().catch((e: unknown) => e);
    expect(isReauthRequired(err)).toBe(true);
    // The difference between offering a password box and offering an emailed link.
    expect(reauthCanUsePassword(err)).toBe(false);
  });

  it('stays an Error, so every existing err.message path still works', async () => {
    stub(400, { error: 'INVALID_CREDENTIALS', message: 'That password is not right.' });
    const err = await authApi.reauth('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('That password is not right.');
  });

  it('does not mistake other refusals for a re-auth prompt', async () => {
    stub(400, { error: 'CANNOT_UNLINK', message: 'Set a password first so you are not locked out.' });
    const err = await authApi.disconnectGoogle().catch((e: unknown) => e);
    expect(isReauthRequired(err)).toBe(false);
    expect(reauthCanUsePassword(err)).toBe(false);
  });

  it('keeps the status on the error but out of the sentence', async () => {
    globalThis.fetch = vi.fn(async () => new Response('gateway exploded', { status: 502 })) as unknown as typeof fetch;
    const err = await authApi.disconnectGoogle().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    // The code is for branching; the message is for a person.
    expect((err as ApiError).code).toBe('HTTP_502');
    expect((err as ApiError).status).toBe(502);
    expect((err as Error).message).not.toMatch(/502|gateway/i);
    expect((err as Error).message).toMatch(/unavailable/i);
  });

  it('does not throw on success', async () => {
    stub(200, { ok: true, sudoUntil: '2026-08-11T10:00:00.000Z' });
    await expect(authApi.reauth('correct horse battery')).resolves.toMatchObject({ ok: true });
  });
});

/*
 * Every page renders `err.message` straight into the UI, so a dropped connection would put "Failed to
 * fetch" on the sign-in form.
 */
describe('failures with nothing human in them', () => {
  it('turns a dropped connection into something a person can act on', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const err = await authApi.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK');
    expect((err as Error).message).not.toContain('fetch');
    expect((err as Error).message).toMatch(/connection|offline/i);
  });

  it('says it is offline when the browser knows it is', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    // node has a `navigator` without `onLine`, so define it rather than spying on a missing getter.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });

    const err = await authApi.me().catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/offline/i);

    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  it('does not claim you are offline when it cannot tell', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

    const err = await authApi.me().catch((e: unknown) => e);
    // Never send somebody to reboot their router over our outage.
    expect((err as Error).message).not.toMatch(/offline/i);
    expect((err as Error).message).toMatch(/could not reach/i);

    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  it('never shows a bare status code', async () => {
    for (const status of [500, 502, 503, 504, 429, 408, 403, 404, 418]) {
      globalThis.fetch = vi.fn(async () => new Response('<html>gateway</html>', { status })) as unknown as typeof fetch;
      const err = await authApi.me().catch((e: unknown) => e);
      const message = (err as Error).message;
      expect(message).not.toMatch(/\d{3}/);
      expect(message.length).toBeGreaterThan(15);
      expect(message).toMatch(/\.$/);
    }
  });

  it('blames the right side for a server fault', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const err = await authApi.me().catch((e: unknown) => e);
    // "Try again" alone invites somebody to assume they mistyped their own password.
    expect((err as Error).message).toMatch(/our end/i);
  });

  it('tells somebody being rate limited to wait rather than to retry', async () => {
    globalThis.fetch = vi.fn(async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    const err = await authApi.me().catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/minute/i);
  });

  it("still prefers the server's own wording when there is any", async () => {
    stub(400, { error: 'INVALID_CREDENTIALS', message: 'Your current password is wrong.' });
    const err = await authApi.reauth('x').catch((e: unknown) => e);
    // The service wrote that sentence for this exact case; our guess must not override it.
    expect((err as Error).message).toBe('Your current password is wrong.');
  });

  it('does not choke on a malformed JSON error body', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('{not json', { status: 500, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch;
    const err = await authApi.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toMatch(/our end/i);
  });
});
