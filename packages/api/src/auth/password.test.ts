import { describe, expect, test } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing (PBKDF2)', () => {
  test('hash then verify roundtrips, rejects wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  test('same password hashes differently (random salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same')).toBe(true);
  });

  /*
   * The work factor is the whole defence for a leaked table, and nothing else here would notice it
   * being lowered: every other test still passes at one iteration. 100,000 is Cloudflare's ceiling
   * for PBKDF2, so this is as high as the platform allows rather than a number picked for taste.
   */
  test('costs the full 100,000 iterations', async () => {
    expect((await hashPassword('x')).split('$')[1]).toBe('100000');
  });

  test('carries a fresh 16-byte salt', async () => {
    const salt = (await hashPassword('x')).split('$')[2] ?? '';
    expect(atob(salt)).toHaveLength(16);
  });

  test('derives a 32-byte key', async () => {
    const hash = (await hashPassword('x')).split('$')[3] ?? '';
    expect(atob(hash)).toHaveLength(32);
  });

  /* Verification reads whatever is in the column. A row that is malformed, truncated, or left over
     from another scheme has to come back false, never throw: a 500 on login is an outage, and one
     that fails open would be worse. */
  test.each([
    ['empty', ''],
    ['not our scheme', 'bcrypt$12$abc$def'],
    ['too few parts', 'pbkdf2$100000$saltonly'],
    ['too many parts', 'pbkdf2$100000$salt$hash$extra'],
    ['iterations missing', 'pbkdf2$$c2FsdA==$aGFzaA=='],
    ['iterations not a number', 'pbkdf2$many$c2FsdA==$aGFzaA=='],
    ['iterations zero', 'pbkdf2$0$c2FsdA==$aGFzaA=='],
    ['iterations negative', 'pbkdf2$-1$c2FsdA==$aGFzaA=='],
  ])('refuses a stored value that is %s', async (_, stored) => {
    await expect(verifyPassword(stored, 'anything')).resolves.toBe(false);
  });

  test('refuses a hash of the wrong length rather than comparing a prefix', async () => {
    const hash = await hashPassword('secret');
    const [, iters, salt] = hash.split('$');
    const truncated = `pbkdf2$${iters}$${salt}$${(hash.split('$')[3] ?? '').slice(0, 20)}`;
    expect(await verifyPassword(truncated, 'secret')).toBe(false);
  });

  test('an empty password is still a password, and still has to match', async () => {
    const hash = await hashPassword('');
    expect(await verifyPassword(hash, '')).toBe(true);
    expect(await verifyPassword(hash, ' ')).toBe(false);
  });

  test('does not fold together passwords that share a prefix', async () => {
    const hash = await hashPassword('correcthorse');
    expect(await verifyPassword(hash, 'correcthors')).toBe(false);
    expect(await verifyPassword(hash, 'correcthorsex')).toBe(false);
  });
});
