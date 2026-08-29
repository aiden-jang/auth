import type { Context, ErrorHandler } from 'hono';
import { PasskeyError } from './auth/passkeys.js';
import type { Env } from './env.js';

/*
 * Never put the error message in the response. This endpoint is public and unauthenticated, and a D1
 * error names columns: that is a free schema map. The id correlates to a log line with the full stack.
 */

/** Prefer the ray id: it is already in the dashboard's log rows, so a second identifier means two to
 *  correlate. The fallback is for `wrangler dev` and tests, which have no ray. */
export function requestIdFrom(request: Request): string {
  const ray = request.headers.get('cf-ray');
  if (ray) return ray;
  return `dev-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** Allowlist, not a trimmed-down request: reset and verification tokens travel in the query string. */
export function errorContext(request: Request, requestId: string): Record<string, string> {
  let path = 'unknown';
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* keep the fallback */
  }
  return { requestId, method: request.method, path };
}

export type WithRequestId = { Bindings: Env; Variables: { requestId: string } };

/** Lives here rather than in index.ts so a test can wire it to a throwing route: Hono seals its
 *  router once built, so one cannot be attached to the live app. */
export const onUnhandledError: ErrorHandler<WithRequestId> = (err, c) => {
  // A failed passkey ceremony is normal (wrong device, cancelled prompt), not a fault.
  if (err instanceof PasskeyError) {
    return c.json({ error: err.code, message: err.message }, err.code === 'NOT_FOUND' ? 404 : 400);
  }
  const requestId = (c as Context<WithRequestId>).get('requestId');
  console.error('Unhandled error:', errorContext(c.req.raw, requestId), err);
  return c.json({ error: 'InternalError', requestId }, 500);
};
