import type { Env } from './env.js';

interface Message {
  to: string;
  subject: string;
  html: string;
  /**
   * The plain-text alternative.
   *
   * Optional only so a caller can be terse; every template here supplies one. A message with no text
   * part renders as raw markup in text-only clients and is one of the cheapest things a spam filter
   * scores against, which for a sign-in link is the difference between arriving and not.
   */
  text?: string;
}

// Sends via Resend when RESEND_API_KEY is set; otherwise logs (dev / no-cost default).
export async function sendEmail(env: Env, msg: Message): Promise<void> {
  // In local dev (APP_URL points at localhost) tag the subject so test
  // emails are obvious in an inbox and in the console log, and never get
  // mistaken for the real thing.
  const isLocal = env.APP_URL?.includes('localhost') ?? false;
  const subject = isLocal ? `[dev] ${msg.subject}` : msg.subject;

  if (!env.RESEND_API_KEY) {
    // The text part in dev, not the markup: it is the readable one, and the whole message is legible
    // in a terminal without copying HTML into a browser.
    console.log(`[email:dev] to=${msg.to} subject=${JSON.stringify(subject)}\n${msg.text ?? msg.html}`);
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
      to: msg.to,
      subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
    }),
  });
  if (!res.ok) console.error('email send failed', res.status, await res.text());
}
