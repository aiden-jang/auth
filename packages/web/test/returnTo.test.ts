import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeReturnTo } from '../src/lib/returnTo';

/** Pretend the SPA is being served from this origin. */
function servedFrom(origin: string): void {
  const url = new URL(origin);
  vi.stubGlobal('window', { location: { origin: url.origin, hostname: url.hostname } });
}

afterEach(() => vi.unstubAllGlobals());

/* The SPA performs this redirect itself, on a value straight out of the query string. It has to
   agree with safeAppRedirect on the server, or the stricter of the two is decoration. */
describe('where a sign-in may hand somebody on to', () => {
  it('allows an app on the platform', () => {
    servedFrom('https://accounts.aidenjang.com');
    expect(safeReturnTo('https://owewell.aidenjang.com/groups')).toBe(
      'https://owewell.aidenjang.com/groups',
    );
  });

  it('resolves a bare path against this origin', () => {
    servedFrom('https://accounts.aidenjang.com');
    expect(safeReturnTo('/account')).toBe('https://accounts.aidenjang.com/account');
  });

  it.each([
    ['a foreign origin', 'https://evil.com/x'],
    ['a scheme-relative url', '//evil.com'],
    ['a javascript url', 'javascript:alert(1)'],
    ['a lookalike suffix', 'https://evilaidenjang.com/'],
    ['our name under theirs', 'https://x.aidenjang.com.evil.com/'],
    ['our host as userinfo', 'https://aidenjang.com@evil.com/'],
    ['a downgrade to http', 'http://aidenjang.com/x'],
    ['a loopback address, in production', 'http://localhost:1234/steal'],
    ['a loopback ip, in production', 'http://127.0.0.1:9/x'],
  ])('refuses %s', (_, target) => {
    servedFrom('https://accounts.aidenjang.com');
    expect(safeReturnTo(target)).toBeNull();
  });

  /* Dev serves the SPA and the worker on two localhost ports, so the hand-back really is loopback
     there. Production is never served from loopback, so it can never be talked into one. */
  it('allows loopback only when the page is itself on loopback', () => {
    servedFrom('http://localhost:34110');
    expect(safeReturnTo('http://localhost:34110/account')).toBe('http://localhost:34110/account');
    expect(safeReturnTo('/account')).toBe('http://localhost:34110/account');
  });

  it('says nothing for nothing', () => {
    servedFrom('https://accounts.aidenjang.com');
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
  });
});
