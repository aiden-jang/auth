import type { Env } from './env.js';

interface Message {
  to: string;
  subject: string;
  html: string;
}

// Sends via Resend when RESEND_API_KEY is set; otherwise logs (dev / no-cost default).
export async function sendEmail(env: Env, msg: Message): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${msg.to} subject=${JSON.stringify(msg.subject)} html=${msg.html}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? 'owewell <noreply@aidenjang.com>',
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!res.ok) console.error('email send failed', res.status, await res.text());
}
