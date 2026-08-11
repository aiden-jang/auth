import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, authApi, isReauthRequired, reauthCanUsePassword } from '../src/lib/api';

/*
 * The step-up flow is driven entirely by the server's error code, so these tests guard the seam it
 * travels through. Before this, `req` threw a bare Error carrying only `message`, which meant the
 * only way to recognise a re-auth refusal from the UI was to match on its prose. That works right
 * up until somebody rewords a sentence, and then the prompt silently stops appearing and the
 * account page just shows "Confirm your password to continue." as a dead-end error.
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

  it('still produces a readable failure when the body is not JSON', async () => {
    globalThis.fetch = vi.fn(async () => new Response('gateway exploded', { status: 502 })) as unknown as typeof fetch;
    const err = await authApi.disconnectGoogle().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('HTTP_502');
    expect((err as Error).message).toContain('502');
  });

  it('does not throw on success', async () => {
    stub(200, { ok: true, sudoUntil: '2026-08-11T10:00:00.000Z' });
    await expect(authApi.reauth('correct horse battery')).resolves.toMatchObject({ ok: true });
  });
});
