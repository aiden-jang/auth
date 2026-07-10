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
  // Only send a genuine IP. Under `wrangler dev` there's no cf-connecting-ip, so callers pass
  // a placeholder like "local"; Cloudflare rejects a non-IP remoteip, which fails verification
  // even for a valid token. An IP contains a dot (v4) or colon (v6).
  if (ip && /[.:]/.test(ip)) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    console.error('turnstile siteverify http error', res.status);
    return false;
  }
  const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!data.success) console.error('turnstile verify failed', data['error-codes']);
  return data.success === true;
}
