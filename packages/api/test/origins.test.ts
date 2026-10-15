import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { expect, it } from 'vitest';
import app from '../src/index.js';

async function request(origin: string | undefined, corsOrigins?: string): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request('https://accounts.test/auth/logout', {
      method: 'POST',
      headers: origin ? { Origin: origin } : {},
    }),
    {
      ...env,
      APP_URL: 'https://accounts.test',
      ...(corsOrigins ? { CORS_ORIGINS: corsOrigins } : {}),
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

it('fails closed for unapproved browser origins when the app allowlist is absent', async () => {
  const response = await request('https://untrusted.test');
  expect(response.status).toBe(403);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  expect(response.headers.get('Set-Cookie')).toBeNull();
});
it('accepts the account origin, an explicitly allowed app, and server-to-server requests', async () => {
  expect((await request('https://accounts.test')).status).toBe(200);
  expect((await request('https://owewell.test', 'https://owewell.test')).status).toBe(200);
  expect((await request(undefined)).status).toBe(200);
});
it('does not widen the allowlist to lookalike domains or opaque origins', async () => {
  for (const origin of ['https://owewell.test.evil.test', 'null']) {
    expect((await request(origin, 'https://owewell.test')).status).toBe(403);
  }
});
