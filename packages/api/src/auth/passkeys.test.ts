import { describe, expect, it } from 'vitest';
import { relyingParty } from './passkeys.js';

/*
 * The relying party id is the one WebAuthn parameter that must never come from the request.
 *
 * A credential is cryptographically bound to the rp id it was made under, and the browser refuses to
 * use it anywhere else. That binding is the entire anti-phishing property of passkeys: it is why a
 * convincing copy of the sign-in page on another domain cannot ask for the real key. Derive the id
 * from a header the caller controls and you hand that property away, because an attacker can then
 * choose which domain a ceremony is bound to.
 *
 * So it comes from APP_URL, which is configuration, and these tests exist to keep it that way.
 */
describe('relying party', () => {
  it('uses the registrable domain, not the full host', () => {
    // A credential made on accounts.aidenjang.com has to work from every app on the domain, which
    // means the id must be the shared parent rather than the host that happened to create it.
    const rp = relyingParty('https://accounts.aidenjang.com', 'https://whatever.test/auth/x');
    expect(rp.id).toBe('aidenjang.com');
  });

  it('keeps the exact origin for the ceremony check', () => {
    // Distinct from the id on purpose: the id is the domain a key is bound to, the origin is where this
    // particular response had to come from, and the second is the stricter of the two.
    const rp = relyingParty('https://accounts.aidenjang.com', 'https://whatever.test/auth/x');
    expect(rp.origin).toBe('https://accounts.aidenjang.com');
  });

  it('prefers configuration over anything in the request', () => {
    // The attack this closes: an attacker-supplied host deciding which domain a credential is bound to.
    const rp = relyingParty('https://accounts.aidenjang.com', 'https://evil.example/auth/passkeys/login/options');
    expect(rp.id).toBe('aidenjang.com');
    expect(rp.origin).not.toContain('evil');
  });

  it('handles localhost, which the spec exempts from secure-origin rules', () => {
    const rp = relyingParty('http://localhost:34110', 'http://localhost:34100/auth/x');
    expect(rp.id).toBe('localhost');
    expect(rp.origin).toBe('http://localhost:34110');
  });

  it('leaves an apex domain alone', () => {
    expect(relyingParty('https://aidenjang.com', 'https://x.test').id).toBe('aidenjang.com');
  });

  it('falls back to the request only when nothing is configured', () => {
    // Not ideal, and better than refusing to serve: a missing APP_URL is a deploy mistake, and this
    // still produces a working single-host setup rather than an outage.
    const rp = relyingParty(undefined, 'https://accounts.aidenjang.com/auth/passkeys/login/options');
    expect(rp.id).toBe('aidenjang.com');
  });

  it('names the product, not the hostname', () => {
    // This string is what the operating system's own prompt shows, so it is read by a person deciding
    // whether to approve something. "accounts.aidenjang.com" is not reassuring; a name is.
    expect(relyingParty('https://accounts.aidenjang.com', 'https://x.test').name).toBe('aidenjang');
  });
});
