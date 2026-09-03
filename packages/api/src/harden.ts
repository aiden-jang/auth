// Shared HTTP hardening. Each app carries its own copy of this file rather than importing one, so
// a Worker is never unsafe because something else failed to deploy. This is the reference version.
// The core helpers are framework-agnostic; `harden` is the Hono wrapper around them.

import type { MiddlewareHandler } from 'hono';

/**
 * Conservative CSP that a Vite SPA runs under unchanged. The two entries that look like mistakes:
 * `style-src 'unsafe-inline'` is required by React `style={}` props and Vite's injected CSS, and
 * `connect-src 'self'` covers same-origin ws/wss too, since CSP3 matches the upgrade to the host.
 *
 * An app needing a cross-origin source passes the `csp` override rather than loosening this.
 */
export const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://static.cloudflareinsights.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** Disable device APIs no app uses by default. wherever overrides to allow geolocation. */
const DEFAULT_PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

export interface SecurityHeaderOptions {
  /** Replace the default CSP wholesale (e.g. to add a cross-origin connect-src). */
  csp?: string;
  /** Replace the default Permissions-Policy (e.g. `geolocation=(self)` for wherever). */
  permissionsPolicy?: string;
}

export function securityHeaders(opts: SecurityHeaderOptions = {}): Record<string, string> {
  return {
    'Content-Security-Policy': opts.csp ?? DEFAULT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Permissions-Policy': opts.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY,
  };
}

export function applySecurityHeaders(headers: Headers, opts: SecurityHeaderOptions = {}): Headers {
  for (const [key, value] of Object.entries(securityHeaders(opts))) headers.set(key, value);
  return headers;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense-in-depth CSRF guard. The primary defense is already the `platform_session` cookie's
 * SameSite=Lax attribute, which stops the browser from attaching it to cross-site POSTs. This
 * adds a second gate: for a state-changing method, if the request carries an Origin header whose
 * host differs from the request's own host, reject it.
 *
 * Only a *present, mismatched* Origin is rejected. A missing one is left to the SameSite gate
 * rather than hard-blocked.
 *
 * Localhost is always allowed: under `wrangler dev` a Worker with a custom-domain route sees every
 * request as that production host, so a genuine call from the local web app would never match. A
 * browser only sends a localhost Origin from a page actually on localhost, so it cannot be forged.
 */
export function enforceSameOrigin(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get('Origin');
  if (origin === null) return null;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return forbidden();
  }
  if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') return null;
  if (originUrl.host !== new URL(request.url).host) return forbidden();
  return null;
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: 'cross-origin request rejected' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface HardenOptions extends SecurityHeaderOptions {
  /** Run the same-origin CSRF guard on state-changing methods. Default true. */
  csrf?: boolean;
}

/**
 * One-line hardening for a Hono Worker: `app.use('*', harden())`. Guards state-changing requests
 * (CSRF) up front, then stamps the security headers onto the response on the way out.
 *
 * Two Workers realities it handles:
 *  - WebSocket upgrades (status 101, e.g. owewell realtime) pass through untouched.
 *  - Static-asset responses from `env.ASSETS.fetch` carry immutable headers, so we rebuild the
 *    Response with a fresh, mutable Headers rather than mutating in place (which would throw).
 */
export function harden(opts: HardenOptions = {}): MiddlewareHandler {
  const { csrf = true, ...headerOpts } = opts;
  return async (c, next) => {
    if (csrf) {
      const blocked = enforceSameOrigin(c.req.raw);
      if (blocked) return blocked;
    }
    await next();
    const res = c.res;
    if (res.status === 101) return;
    const headers = new Headers(res.headers);
    applySecurityHeaders(headers, headerOpts);
    c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
