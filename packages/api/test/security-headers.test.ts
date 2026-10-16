import { SELF } from 'cloudflare:test';
import { expect, test } from 'vitest';

for (const [origin, upgrade] of [
  ['http://localhost:34100', false],
  ['http://127.0.0.1:34100', false],
  ['https://localhost:34100', true],
  ['https://accounts.aidenjang.com', true],
  ['http://accounts.aidenjang.com', true],
  ['http://localhost.example.com', true],
  ['http://127.0.0.1.example.com', true],
] as const) {
  test(`asset upgrades match the secure-request policy at ${origin}`, async () => {
    const response = await SELF.fetch(`${origin}/health`);
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(response.status).toBe(200);
    expect(policy.includes('upgrade-insecure-requests')).toBe(upgrade);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  });
}
