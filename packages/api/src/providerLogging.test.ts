import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import { exchangeGoogleCode } from './auth/google.js';
import { sendEmail } from './email.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const message = {
  to: 'private-recipient@example.test',
  subject: 'Reset your password',
  html: '<a href="https://accounts.test/reset-password?token=private-reset-token">Reset</a>',
  text: 'https://accounts.test/reset-password?token=private-reset-token',
};

it('keeps a rejected OAuth response body out of logs', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: 'invalid_grant', error_description: 'private-provider-detail' },
          { status: 400 },
        ),
      ),
  );
  expect(
    await exchangeGoogleCode(
      'client',
      'private-secret',
      'private-code',
      'https://accounts.test/callback',
    ),
  ).toBeNull();
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
});

it('never logs access or refresh tokens when the identity token is missing', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'private-access-token',
        refresh_token: 'private-refresh-token',
      }),
    ),
  );
  expect(
    await exchangeGoogleCode(
      'client',
      'private-secret',
      'private-code',
      'https://accounts.test/callback',
    ),
  ).toBeNull();
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
});

it('logs the email provider status without its response body', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('private-email-provider-detail', { status: 503 })),
  );
  await sendEmail(
    { ...env, APP_URL: 'https://accounts.test', RESEND_API_KEY: 'test-key' },
    message,
  );
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
});

it('does not print credential-bearing email when a production provider is unconfigured', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await sendEmail({ ...env, APP_URL: 'https://accounts.test', RESEND_API_KEY: '' }, message);
  expect(fetcher).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalled();
  expect(JSON.stringify(error.mock.calls)).not.toContain('private-');
});

it.each(['http://localhost:34110', 'http://127.0.0.1:34110'])(
  'retains dev-mail inspection on %s',
  async (origin) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await sendEmail({ ...env, APP_URL: origin, RESEND_API_KEY: '' }, message);
    expect(fetcher).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[dev] Reset your password'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('private-reset-token'));
  },
);
