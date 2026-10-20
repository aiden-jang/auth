import { afterEach, expect, it, vi } from 'vitest';
import { safeReturnTo } from './returnTo';

afterEach(() => vi.unstubAllGlobals());

it.each([
  'ftp://localhost:34110/account',
  'ws://127.0.0.1:34110/account',
  'javascript://localhost/%0aalert(1)',
  'https://guest:secret@worth.aidenjang.com/',
])('rejects a non-web or credential-bearing redirect even in development: %s', (target) => {
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:34110', hostname: 'localhost' },
  });
  expect(safeReturnTo(target)).toBeNull();
});

it('preserves ordinary web handoffs from a local sign-in', () => {
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:34110', hostname: 'localhost' },
  });
  expect(safeReturnTo('http://127.0.0.1:34300/lists')).toBe('http://127.0.0.1:34300/lists');
  expect(safeReturnTo('https://worth.aidenjang.com/lists')).toBe(
    'https://worth.aidenjang.com/lists',
  );
});
