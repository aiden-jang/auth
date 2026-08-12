import type { Context, ErrorHandler } from 'hono';
import { PasskeyError } from './auth/passkeys.js';
import type { Env } from './env.js';

/*
 * One id per request, in the response and in the logs.
 *
 * The identity service answers a failure with `{ error: 'InternalError' }` and nothing else, which is the
 * right thing to send and a miserable thing to debug: a 500 on sign-in is indistinguishable from any other
 * 500, and working out which one you hit meant reproducing it by hand.
 *
 * Returning the actual error instead would fix that and is the wrong trade here specifically. This
 * endpoint is public, unauthenticated and the highest-value target on the platform, so the message is
 * exactly what an attacker wants: the outage this was written after would have replied with a D1 error
 * naming the column a migration had not created, which is a free map of the schema and where it had
 * drifted. An id leaks nothing, and it buys more than a message would, because the log behind it has the
 * whole stack rather than one truncated line.
 */

/**
 * The id for this request.
 *
 * Prefers Cloudflare's ray id, because that is the one already stamped on the response, already in the
 * dashboard's log rows, and already what support tooling keys on. Inventing a second identifier alongside
 * it would mean correlating two. Falls back to a random one for `wrangler dev` and tests, where there is
 * no ray.
 */
export function requestIdFrom(request: Request): string {
  const ray = request.headers.get('cf-ray');
  if (ray) return ray;
  // Short and unambiguous. This only has to be unique among the requests in a log window, not globally.
  return `dev-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * What gets logged next to the error.
 *
 * Method and path so a log line stands alone, without needing the id looked up somewhere else first.
 * Deliberately no query string, no headers and no body: this service handles passwords and one-time
 * tokens, and the log is the last place they should end up.
 */
export function errorContext(request: Request, requestId: string): Record<string, string> {
  let path = 'unknown';
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* keep the fallback */
  }
  return { requestId, method: request.method, path };
}

/** The app's env, as far as anything in this file is concerned. */
export type WithRequestId = { Bindings: Env; Variables: { requestId: string } };

/**
 * What a request that fell over turns into.
 *
 * Extracted from the route table so it can be tested through real Hono machinery: the router seals
 * itself once built, so a throwing route cannot be attached to the live app afterwards, and the one
 * response shape most worth checking is the one no ordinary request produces.
 */
export const onUnhandledError: ErrorHandler<WithRequestId> = (err, c) => {
  // A failed passkey ceremony is a normal outcome (wrong device, cancelled prompt, expired attempt), so
  // it carries its own message and status rather than being logged as a fault and returned as a 500.
  if (err instanceof PasskeyError) {
    return c.json({ error: err.code, message: err.message }, err.code === 'NOT_FOUND' ? 404 : 400);
  }
  /*
   * The id is the only thing about this failure that crosses the wire.
   *
   * It is logged beside the real error, so `wrangler tail | grep <id>` (or the Logs tab) turns a 500 seen
   * in a browser's network panel into the actual stack. The message stays server-side: this is the
   * identity service, and "no such column: reauth_at" is a schema map for anyone who can send a request.
   */
  const requestId = (c as Context<WithRequestId>).get('requestId');
  console.error('Unhandled error:', errorContext(c.req.raw, requestId), err);
  return c.json({ error: 'InternalError', requestId }, 500);
};
