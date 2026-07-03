import { describe, expect, it } from 'vitest';
import {
  applySecurityHeaders,
  DEFAULT_CSP,
  enforceSameOrigin,
  securityHeaders,
} from './index.js';

describe('securityHeaders', () => {
  it('sets the core headers with the default CSP', () => {
    const h = securityHeaders();
    expect(h['Content-Security-Policy']).toBe(DEFAULT_CSP);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('honors CSP and Permissions-Policy overrides', () => {
    const h = securityHeaders({ csp: "default-src 'none'", permissionsPolicy: 'geolocation=(self)' });
    expect(h['Content-Security-Policy']).toBe("default-src 'none'");
    expect(h['Permissions-Policy']).toBe('geolocation=(self)');
  });

  it('applySecurityHeaders mutates a Headers object', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('enforceSameOrigin', () => {
  const post = (headers: Record<string, string> = {}) =>
    new Request('https://owewell.aidenjang.com/owewell/groups', { method: 'POST', headers });

  it('allows safe methods regardless of origin', () => {
    const req = new Request('https://owewell.aidenjang.com/x', {
      method: 'GET',
      headers: { Origin: 'https://evil.example' },
    });
    expect(enforceSameOrigin(req)).toBeNull();
  });

  it('allows a state-changing request with no Origin header (SameSite is the gate)', () => {
    expect(enforceSameOrigin(post())).toBeNull();
  });

  it('allows a same-origin state-changing request', () => {
    expect(enforceSameOrigin(post({ Origin: 'https://owewell.aidenjang.com' }))).toBeNull();
  });

  it('rejects a cross-origin state-changing request', () => {
    const res = enforceSameOrigin(post({ Origin: 'https://evil.example' }));
    expect(res?.status).toBe(403);
  });

  it('rejects a malformed Origin', () => {
    const res = enforceSameOrigin(post({ Origin: 'not-a-url' }));
    expect(res?.status).toBe(403);
  });
});
