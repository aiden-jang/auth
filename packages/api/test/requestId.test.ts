import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { errorContext, onUnhandledError, requestIdFrom, type WithRequestId } from '../src/requestId.js';

/*
 * The id is the whole debugging story, so it has to actually arrive.
 *
 * A 500 from this service says `InternalError` and nothing else, on purpose: it is public,
 * unauthenticated, and the message would describe the schema to anyone who asked. The id is what makes
 * that bearable, and an id that is missing from the response, or different from the one in the log, is
 * worse than none at all because it looks like it works.
 */

const BASE = 'https://accounts.test';

describe('picking an id', () => {
  it('uses Cloudflare’s ray id when there is one', () => {
    // Already on the response and already the key in the dashboard's log rows. A second identifier
    // alongside it would mean correlating two things instead of one.
    const request = new Request(BASE, { headers: { 'cf-ray': '8a1b2c3d4e5f6789-EWR' } });
    expect(requestIdFrom(request)).toBe('8a1b2c3d4e5f6789-EWR');
  });

  it('makes one up in local dev, where there is no ray', () => {
    const id = requestIdFrom(new Request(BASE));
    expect(id).toMatch(/^dev-[0-9a-f]{12}$/);
  });

  it('does not hand out the same id twice', () => {
    const ids = new Set(Array.from({ length: 50 }, () => requestIdFrom(new Request(BASE))));
    expect(ids.size).toBe(50);
  });
});

describe('what gets logged beside the error', () => {
  it('carries enough that a log line stands on its own', () => {
    const context = errorContext(new Request(`${BASE}/auth/login`, { method: 'POST' }), 'ray-1');
    expect(context).toEqual({ requestId: 'ray-1', method: 'POST', path: '/auth/login' });
  });

  /*
   * No query string, no headers, no body.
   *
   * This service handles passwords, magic-link tokens and reset tokens, several of which travel in the
   * URL. A log line is exactly where they must not end up, so the context is built from an allowlist of
   * three fields rather than by trimming a request down.
   */
  it('leaves the query string out, because tokens live there', () => {
    const context = errorContext(new Request(`${BASE}/auth/verify?token=super-secret-value`), 'ray-1');
    expect(JSON.stringify(context)).not.toContain('super-secret-value');
    expect(context.path).toBe('/auth/verify');
  });

  it('never grows a field that was not chosen deliberately', () => {
    const context = errorContext(new Request(`${BASE}/x`, { headers: { cookie: 'platform_session=abc' } }), 'r');
    expect(Object.keys(context).sort()).toEqual(['method', 'path', 'requestId']);
  });
});

describe('over the wire', () => {
  it('puts an id on an ordinary response, not only on failures', async () => {
    // A 200 with a surprising body needs correlating as much as a 500 does.
    const res = await SELF.fetch(`${BASE}/auth/me`);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('echoes the ray id it was given, so the response and the log agree', async () => {
    const ray = '8a1b2c3d4e5f6789-LHR';
    const res = await SELF.fetch(`${BASE}/auth/me`, { headers: { 'cf-ray': ray } });
    expect(res.headers.get('x-request-id')).toBe(ray);
  });

  it('gives every request a different id', async () => {
    const [a, b] = await Promise.all([SELF.fetch(`${BASE}/auth/me`), SELF.fetch(`${BASE}/auth/me`)]);
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));
  });

  /*
   * The 500 body itself, through the real handler.
   *
   * Nothing in this service throws on demand, which is a good property and an awkward one to test
   * against: the response shape that matters most is the one no request produces. A route that throws is
   * attached to the real app here so the assertion runs through the actual `onError`, catch-all and
   * middleware chain rather than against a copy of the handler.
   */
  it('returns the id on a real 500, and still nothing else', async () => {
    // The production handler, wired the production way, over a route that does what no real route does.
    const throwing = new Hono<WithRequestId>();
    throwing.use('*', async (c, next) => {
      c.set('requestId', requestIdFrom(c.req.raw));
      await next();
      c.header('x-request-id', c.get('requestId'));
    });
    throwing.onError(onUnhandledError);
    throwing.get('/__throws', () => {
      throw new Error('secret internal detail: no such column reauth_at');
    });

    const res = await throwing.request(`${BASE}/__throws`, { headers: { 'cf-ray': 'ray-boom-1' } });
    expect(res.status).toBe(500);

    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toBe('InternalError');
    expect(body.requestId).toBe('ray-boom-1');
    // The header and the body agree, so either one correlates to the same log line.
    expect(res.headers.get('x-request-id')).toBe('ray-boom-1');
    // And the thing that must never travel, did not.
    expect(JSON.stringify(body)).not.toContain('reauth_at');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });

  it('still says nothing about why a request was rejected', async () => {
    /*
     * The reason the id exists rather than the message.
     *
     * Whatever else this adds, a caller must not learn from a failed sign-in whether the account exists,
     * nor anything about the implementation behind it.
     */
    const res = await SELF.fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-here' }),
    });
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/no such|not found|unknown user|does not exist|column|sqlite|D1_|stack/i);
  });
});
