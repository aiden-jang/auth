import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'platform_session';

/*
 * Generic over the env, not a fixed alias.
 *
 * These helpers only read the URL and write cookies, so a context from any route should be acceptable.
 * Hono's Context is invariant in its env (both `get` and `set` mention it), so a concrete
 * `Context<{ Bindings: Env }>` rejects a context from an app that declares any Variables at all, in both
 * directions. Inferring the env per call is the only version that stays open as the app grows.
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
 * The in-flight WebAuthn ceremony id.
 *
 * SameSite=Strict rather than Lax, unlike the session cookie. A session has to survive arriving from
 * another site (that is the whole point of a return_to sign-in flow); a ceremony never legitimately
 * starts on one page and finishes from a cross-site navigation, so Strict costs nothing here and takes
 * a class of cross-site completion off the table. Short-lived, and the row it points at is deleted the
 * moment it is used.
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
