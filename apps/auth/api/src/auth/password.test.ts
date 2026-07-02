import { describe, expect, test } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { hashToken } from './session.js';

describe('password hashing (argon2id WASM)', () => {
  test('hash then verify roundtrips, rejects wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  test('same password hashes differently (random salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same')).toBe(true);
  });
});

describe('session token hashing', () => {
  test('sha256 is deterministic, 64 hex chars', async () => {
    const a = await hashToken('token-abc');
    expect(a).toBe(await hashToken('token-abc'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
