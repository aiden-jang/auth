import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import {
  clearChallengeCookie,
  clearSessionCookie,
  isSecureRequest,
  setChallengeCookie,
  setSessionCookie,
  SESSION_COOKIE,
} from './cookie.js';

/* A real 30-day session expiry. Hono refuses anything past 400 days, so a far-future date here
   would test the guard rather than the cookie. */
const EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

/** Run one cookie helper inside a real request and hand back the Set-Cookie it produced. */
async function setCookies(
  url: string,
  env: Partial<Env>,
  run: (c: Parameters<typeof setSessionCookie>[0]) => void,
): Promise<[string]> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('*', (c) => {
    run(c);
    return c.body(null, 204);
  });
  const res = await app.fetch(new Request(url), env as Env);
  const header = res.headers.get('set-cookie');
  expect(header, 'the helper set no cookie at all').toBeTruthy();
  return [header!];
}

const attrs = (cookie: string): string[] =>
  cookie
    .split(';')
    .slice(1)
    .map((a) => a.trim());

describe('the session cookie', () => {
  it('is unreadable to scripts, https-only and scoped to the whole site', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setSessionCookie(c, 'tok', EXPIRES),
    );
    expect(cookie).toContain(`${SESSION_COOKIE}=tok`);
    expect(attrs(cookie)).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']),
    );
  });

  /*
   * Lax, not Strict. The cookie has to arrive on a top-level navigation from another app on the
   * platform, which is exactly how every SSO hand-back lands. Strict would drop it and the person
   * would bounce straight back to the login page.
   */
  it('is Lax, so it survives arriving from another app', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setSessionCookie(c, 'tok', EXPIRES),
    );
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('SameSite=Strict');
  });

  // One cookie shared across every app, so it must be set on the parent domain.
  it('spans the platform when COOKIE_DOMAIN is configured', async () => {
    const [cookie] = await setCookies(
      'https://accounts.aidenjang.com/x',
      { COOKIE_DOMAIN: '.aidenjang.com' },
      (c) => setSessionCookie(c, 'tok', EXPIRES),
    );
    expect(cookie).toContain('Domain=.aidenjang.com');
  });

  it('stays host-only when it is not', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setSessionCookie(c, 'tok', EXPIRES),
    );
    expect(cookie).not.toContain('Domain=');
  });

  it('expires with the session it names, not when the browser is closed', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setSessionCookie(c, 'tok', EXPIRES),
    );
    expect(cookie).toContain(`Expires=${EXPIRES.toUTCString()}`);
  });
});

/*
 * A ceremony cookie is Strict where the session is Lax: a sign-in has to survive arriving from
 * another site, a half-finished passkey or OAuth challenge never legitimately does. Strict takes
 * cross-site completion of one off the table without any further checks.
 */
describe('the challenge cookie', () => {
  it('is Strict, unlike the session cookie', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setChallengeCookie(c, 'passkey_challenge', 'ch_1', 60_000),
    );
    expect(cookie).toContain('SameSite=Strict');
    expect(attrs(cookie)).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'Path=/']));
  });

  it('carries its own expiry so an abandoned ceremony lapses', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      setChallengeCookie(c, 'passkey_challenge', 'ch_1', 60_000),
    );
    expect(cookie).toMatch(/Expires=/);
  });
});

/*
 * A browser matches a deletion to the cookie it is replacing by name, domain and path alone. Miss
 * the domain and the old cookie is still sent on the next request: sign-out would appear to work
 * and leave the session live.
 */
describe('clearing a cookie', () => {
  it('targets the same domain and path it was set on', async () => {
    const [cookie] = await setCookies(
      'https://accounts.aidenjang.com/x',
      { COOKIE_DOMAIN: '.aidenjang.com' },
      (c) => clearSessionCookie(c),
    );
    expect(cookie).toContain('Domain=.aidenjang.com');
    expect(cookie).toContain('Path=/');
  });

  it('sends an empty value that has already expired', async () => {
    const [cookie] = await setCookies('https://accounts.aidenjang.com/x', {}, (c) =>
      clearSessionCookie(c),
    );
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it('clears a challenge cookie the same way', async () => {
    const [cookie] = await setCookies(
      'https://accounts.aidenjang.com/x',
      { COOKIE_DOMAIN: '.aidenjang.com' },
      (c) => clearChallengeCookie(c, 'passkey_challenge'),
    );
    expect(cookie).toContain('passkey_challenge=;');
    expect(cookie).toContain('Domain=.aidenjang.com');
  });
});

/*
 * Cloudflare hands the Worker a request that often reads as http even though the browser is on
 * https. Keying Secure off the scheme would silently drop it in production, so every real host is
 * treated as secure and only localhost is allowed to look at the scheme.
 */
describe('deciding whether a cookie is Secure', () => {
  const ask = async (url: string): Promise<boolean> => {
    const app = new Hono<{ Bindings: Env }>();
    let secure = false;
    app.get('*', (c) => {
      secure = isSecureRequest(c);
      return c.body(null, 204);
    });
    await app.fetch(new Request(url), {} as Env);
    return secure;
  };

  it('marks a real host secure even when the worker sees http', async () => {
    expect(await ask('http://accounts.aidenjang.com/x')).toBe(true);
  });

  it('drops Secure on plain-http localhost, or dev could never hold a session', async () => {
    expect(await ask('http://localhost:34100/x')).toBe(false);
    expect(await ask('http://127.0.0.1:34100/x')).toBe(false);
  });

  it('keeps it when localhost is served over https', async () => {
    expect(await ask('https://localhost:34100/x')).toBe(true);
  });
});
