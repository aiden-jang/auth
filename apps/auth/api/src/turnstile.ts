// Verify a Cloudflare Turnstile token server-side. Callers skip this entirely when no
// TURNSTILE_SECRET is configured (dev / not-yet-set).
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip?: string,
): Promise<boolean> {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
