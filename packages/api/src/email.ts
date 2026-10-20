import type { Env } from './env.js';

interface Message {
  to: string;
  subject: string;
  html: string;
  /** Always supply one: without it, text-only clients get raw markup and spam score goes up. */
  text?: string;
}

// Only loopback development may print credential-bearing mail for local inspection.
export async function sendEmail(env: Env, msg: Message): Promise<void> {
  let isLocal = false;
  try {
    const url = new URL(env.APP_URL ?? '');
    isLocal =
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    /* Missing or malformed configuration must not enable credential logging. */
  }
  const subject = isLocal ? `[dev] ${msg.subject}` : msg.subject;

  if (!env.RESEND_API_KEY) {
    if (!isLocal) {
      console.error('email delivery unavailable: provider not configured');
      return;
    }
    console.log(
      `[email:dev] to=${msg.to} subject=${JSON.stringify(subject)}\n${msg.text ?? msg.html}`,
    );
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? 'aidenjang <noreply@aidenjang.com>',
      reply_to: 'hello@aidenjang.com',
      to: msg.to,
      subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
    }),
  });
  if (!res.ok) console.error('email send failed', res.status);
}
