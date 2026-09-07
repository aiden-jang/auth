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
  "script-src 'self' https://static.cloudflareinsights.com",
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
 * Second gate behind SameSite=Lax: a state-changing request whose Origin host differs from its own.
 * A *missing* Origin is left to SameSite rather than hard-blocked.
 *
 * Localhost always passes: under `wrangler dev` a custom-domain Worker sees every request as the
 * production host, so a real local call never matches. Only a page on localhost can send that
 * Origin, so it cannot be forged.
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
 * CSRF guard in, security headers out. Two Workers details: a 101 upgrade passes through untouched,
 * and `env.ASSETS.fetch` responses have immutable headers, so the Response is rebuilt rather than
 * mutated -- mutating throws.
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
