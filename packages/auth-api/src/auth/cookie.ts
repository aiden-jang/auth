import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'platform_session';

type Ctx = Context<{ Bindings: Env }>;

// Secure only over https, so the cookie still flows in local `wrangler dev` (http).
function isSecure(c: Ctx): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

export function setSessionCookie(c: Ctx, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
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
