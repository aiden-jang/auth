import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import { sendEmail } from './email.js';

afterEach(() => vi.unstubAllGlobals());
it('keeps sender overrides and plain text while routing replies to the public contact address', async () => {
  const send = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', send);
  await sendEmail(
    {
      ...env,
      RESEND_API_KEY: 'local-test',
      EMAIL_FROM: 'Accounts <noreply@accounts.test>',
      APP_URL: 'https://accounts.test',
    },
    {
      to: 'person@example.test',
      subject: 'Verify your email',
      html: '<p>Verify</p>',
      text: 'Verify',
    },
  );
  expect(send).toHaveBeenCalledTimes(1);
  const options = send.mock.calls[0]![1] as RequestInit;
  expect(JSON.parse(String(options.body))).toMatchObject({
    from: 'Accounts <noreply@accounts.test>',
    reply_to: 'hello@aidenjang.com',
    subject: 'Verify your email',
    text: 'Verify',
  });
});
