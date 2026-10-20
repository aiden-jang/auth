import { describe, expect, it } from 'vitest';
import { googleAuthUrl, googleCallbackUrl, safeAppRedirect } from './google.js';

const PROD = 'https://accounts.aidenjang.com';
const ACCOUNT = 'https://accounts.aidenjang.com/account';

describe('where a sign-in is allowed to land', () => {
  it('sends someone on to the app they came from', () => {
    expect(safeAppRedirect('https://owewell.aidenjang.com/groups', PROD)).toBe(
      'https://owewell.aidenjang.com/groups',
    );
  });

  it('resolves a bare path against the account app', () => {
    expect(safeAppRedirect('/groups?invite=abc', PROD)).toBe(`${PROD}/groups?invite=abc`);
  });

  it('falls back to the account page when nothing was asked for', () => {
    expect(safeAppRedirect('', PROD)).toBe(ACCOUNT);
  });

  /*
   * The open-redirect list. A post-login redirect is a credible phishing vector: the victim really
   * did just sign in to the real site, so the landing page inherits that trust.
   *
   * `evilaidenjang.com` and `x.aidenjang.com.evil.com` are the two a naive substring check waves
   * through. `aidenjang.com@evil.com` reads as ours until you notice the host is the part after
   * the `@`. `//evil.com` inherits the current scheme and is a URL, not a path.
   */
  it.each([
    ['a foreign origin', 'https://evil.com/x'],
    ['a scheme-relative url', '//evil.com'],
    ['a javascript url', 'javascript:alert(1)'],
    ['a data url', 'data:text/html,<script>alert(1)</script>'],
    ['a lookalike suffix', 'https://evilaidenjang.com/x'],
    ['our name as a subdomain of theirs', 'https://x.aidenjang.com.evil.com/'],
    ['our host smuggled into userinfo', 'https://aidenjang.com@evil.com/'],
    ['a trailing-dot host', 'https://aidenjang.com./x'],
    ['a loopback address, in production', 'http://localhost:1234/steal'],
    ['a loopback ip, in production', 'http://127.0.0.1:9/x'],
    ['a downgrade to plain http', 'http://aidenjang.com/x'],
  ])('refuses %s', (_, target) => {
    expect(safeAppRedirect(target, PROD)).toBe(ACCOUNT);
  });

  /*
   * Dev runs the worker and the UI on two localhost ports, so the hand-back really is loopback
   * there. What decides is the app's own origin, not the target: production never serves from
   * localhost, so it can never be talked into pointing at one.
   */
  it('allows loopback only when the account app is itself on loopback', () => {
    const DEV = 'http://localhost:34110';
    expect(safeAppRedirect('http://localhost:34110/account', DEV)).toBe(
      'http://localhost:34110/account',
    );
    expect(safeAppRedirect('/groups', DEV)).toBe('http://localhost:34110/groups');
  });

  it.each([
    'ftp://localhost:34110/account',
    'ws://127.0.0.1:34110/account',
    'javascript://localhost/%0aalert(1)',
    'https://guest:secret@worth.aidenjang.com/',
  ])('rejects non-web schemes and embedded credentials in local redirects: %s', (target) => {
    expect(safeAppRedirect(target, 'http://localhost:34110')).toBe(
      'http://localhost:34110/account',
    );
  });

  it('accepts the apex and any subdomain of it', () => {
    expect(safeAppRedirect('https://aidenjang.com/x', PROD)).toBe('https://aidenjang.com/x');
    expect(safeAppRedirect('https://bloomnote.aidenjang.com/g/1', PROD)).toBe(
      'https://bloomnote.aidenjang.com/g/1',
    );
  });
});

/*
 * Google compares redirect_uri byte for byte against the registered value, and rejects the
 * exchange on any difference. Behind Cloudflare the Worker often sees its own request as http,
 * so trusting the scheme would break every production sign-in.
 */
describe('the callback url given to Google', () => {
  it('forces https on a real host, whatever scheme the worker saw', () => {
    expect(googleCallbackUrl('http://accounts.aidenjang.com/auth/google')).toBe(
      'https://accounts.aidenjang.com/auth/google/callback',
    );
  });

  it('leaves localhost on http, where there is no certificate', () => {
    expect(googleCallbackUrl('http://localhost:34100/auth/google')).toBe(
      'http://localhost:34100/auth/google/callback',
    );
    expect(googleCallbackUrl('http://127.0.0.1:34100/auth/google')).toBe(
      'http://127.0.0.1:34100/auth/google/callback',
    );
  });

  // The auth request and the exchange each build this separately; they have to agree exactly.
  it('is the same string wherever the request came in', () => {
    const fromAuth = googleCallbackUrl('https://accounts.aidenjang.com/auth/google?return_to=/x');
    const fromExchange = googleCallbackUrl(
      'https://accounts.aidenjang.com/auth/google/callback?code=abc&state=xyz',
    );
    expect(fromAuth).toBe(fromExchange);
  });
});

describe('the consent screen url', () => {
  const url = () =>
    new URL(googleAuthUrl('client-123', `${PROD}/auth/google/callback`, 'state-xyz'));

  it('points at Google', () => {
    expect(url().origin + url().pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('asks for a code, with the identity scopes', () => {
    expect(url().searchParams.get('response_type')).toBe('code');
    expect(url().searchParams.get('scope')).toBe('openid email profile');
  });

  // State is the CSRF defence: the callback compares it against the cookie it set.
  it('carries the state through untouched', () => {
    expect(url().searchParams.get('state')).toBe('state-xyz');
  });

  it('passes the client id and callback Google will check', () => {
    expect(url().searchParams.get('client_id')).toBe('client-123');
    expect(url().searchParams.get('redirect_uri')).toBe(`${PROD}/auth/google/callback`);
  });
});
