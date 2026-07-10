import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'platform_session';

type Ctx = Context<{ Bindings: Env }>;

// Whether to set the `Secure` cookie flag. Behind Cloudflare the Worker often sees the request as
// `http` even though the public URL is `https`, so keying off the scheme alone would drop `Secure`
// in prod. Instead treat every real host as secure and only fall back to the scheme for localhost,
// so cookies still flow in local `wrangler dev` (http).
export function isSecureRequest(c: Ctx): boolean {
  const { hostname, protocol } = new URL(c.req.url);
  if (hostname === 'localhost' || hostname === '127.0.0.1') return protocol === 'https:';
  return true;
}

export function setSessionCookie(c: Ctx, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export { getCookie };
