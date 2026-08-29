import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeRecentAccounts,
  maskEmail,
  readRecentAccounts,
  recentAccountTimeLabel,
  rememberRecentAccount,
} from '../src/lib/recentAccount';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('maskEmail', () => {
  it('keeps the account recognizable without showing the whole address', () => {
    expect(maskEmail('aiden.jang@example.com')).toBe('ai•••@example.com');
    expect(maskEmail('a@example.com')).toBe('a•••@example.com');
  });

  it('leaves malformed input alone instead of inventing an account', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  it('keeps the three most recently used accounts, newest first', () => {
    rememberRecentAccount('one@example.com');
    rememberRecentAccount('two@example.com');
    rememberRecentAccount('three@example.com');
    rememberRecentAccount('four@example.com');
    expect(readRecentAccounts().map(account => account.email)).toEqual([
      'four@example.com',
      'three@example.com',
      'two@example.com',
    ]);
  });

  it('keeps accounts saved before the email link went away, dropping the stale method', () => {
    const saved = '[{"email":"old@example.com","method":"email-link","lastUsedAt":"2026-08-11T12:00:00Z"}]';
    expect(decodeRecentAccounts(saved)).toEqual([
      { email: 'old@example.com', lastUsedAt: '2026-08-11T12:00:00Z' },
    ]);
  });

  it('rejects malformed stored account profiles', () => {
    expect(decodeRecentAccounts('[{"email":"nope","method":"password","lastUsedAt":"today"}]')).toEqual([]);
  });

  it('turns recent timestamps into human labels', () => {
    expect(recentAccountTimeLabel('2026-08-11T12:00:00Z', new Date('2026-08-11T20:00:00Z'))).toBe('used today');
    expect(recentAccountTimeLabel('2026-08-10T12:00:00Z', new Date('2026-08-11T20:00:00Z'))).toBe('used yesterday');
  });
});
