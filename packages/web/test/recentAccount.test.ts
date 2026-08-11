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

  it('keeps the three most recently used accounts and their methods', () => {
    rememberRecentAccount('one@example.com', 'password');
    rememberRecentAccount('two@example.com', 'email-link');
    rememberRecentAccount('three@example.com', 'password');
    rememberRecentAccount('four@example.com', 'email-link');
    expect(readRecentAccounts().map(account => [account.email, account.method])).toEqual([
      ['four@example.com', 'email-link'],
      ['three@example.com', 'password'],
      ['two@example.com', 'email-link'],
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
