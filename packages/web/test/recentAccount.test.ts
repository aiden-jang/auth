import { describe, expect, it } from 'vitest';
import { maskEmail } from '../src/lib/recentAccount';

describe('maskEmail', () => {
  it('keeps the account recognizable without showing the whole address', () => {
    expect(maskEmail('aiden.jang@example.com')).toBe('ai•••@example.com');
    expect(maskEmail('a@example.com')).toBe('a•••@example.com');
  });

  it('leaves malformed input alone instead of inventing an account', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
