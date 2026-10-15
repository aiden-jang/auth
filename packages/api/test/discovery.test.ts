import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('sends password managers to the password form without caching the redirect', async () => {
  const response = await SELF.fetch('https://accounts.test/.well-known/change-password', {
    redirect: 'manual',
  });
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('/account?password=change');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('does not mistake the single-page fallback for a discovery resource', async () => {
  const response = await SELF.fetch(
    'https://accounts.test/.well-known/resource-that-should-not-exist-whose-status-code-should-not-be-200',
  );
  expect(response.status).toBe(404);
});
