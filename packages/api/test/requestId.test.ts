import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { errorContext, onUnhandledError, requestIdFrom, type WithRequestId } from '../src/requestId.js';

/* An id that is missing, or different from the one logged, is worse than none: it looks like it works. */

const BASE = 'https://accounts.test';

describe('picking an id', () => {
  it('uses Cloudflare’s ray id when there is one', () => {
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
    // A 200 with a surprising body needs correlating too.
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

  // Nothing here throws on demand, so the shape that matters most is the one no request produces.
  it('returns the id on a real 500, and still nothing else', async () => {
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
    expect(res.headers.get('x-request-id')).toBe('ray-boom-1');
    expect(JSON.stringify(body)).not.toContain('reauth_at');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });

  it('still says nothing about why a request was rejected', async () => {
    const res = await SELF.fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-here' }),
    });
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/no such|not found|unknown user|does not exist|column|sqlite|D1_|stack/i);
  });
});
