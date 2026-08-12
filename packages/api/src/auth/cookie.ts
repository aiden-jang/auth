import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'platform_session';

/*
 * Generic, not a fixed alias: Hono's Context is invariant in its env, so a concrete
 * `Context<{ Bindings: Env }>` rejects every call once the app declares any Variables.
 */
type Ctx<E extends { Bindings: Env }> = Context<E>;

// Whether to set the `Secure` cookie flag. Behind Cloudflare the Worker often sees the request as
// `http` even though the public URL is `https`, so keying off the scheme alone would drop `Secure`
// in prod. Instead treat every real host as secure and only fall back to the scheme for localhost,
// so cookies still flow in local `wrangler dev` (http).
export function isSecureRequest<E extends { Bindings: Env }>(c: Ctx<E>): boolean {
  const { hostname, protocol } = new URL(c.req.url);
  if (hostname === 'localhost' || hostname === '127.0.0.1') return protocol === 'https:';
  return true;
}

export function setSessionCookie<E extends { Bindings: Env }>(c: Ctx<E>, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

/*
 * Strict, unlike the session cookie's Lax: a session must survive arriving from another site, a
 * ceremony never legitimately does. Takes cross-site completion off the table for free.
 */
export function setChallengeCookie<E extends { Bindings: Env }>(c: Ctx<E>, name: string, id: string, ttlMs: number): void {
  setCookie(c, name, id, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Strict',
    path: '/',
    expires: new Date(Date.now() + ttlMs),
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export function clearChallengeCookie<E extends { Bindings: Env }>(c: Ctx<E>, name: string): void {
  deleteCookie(c, name, {
    path: '/',
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export function clearSessionCookie<E extends { Bindings: Env }>(c: Ctx<E>): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export { getCookie };
