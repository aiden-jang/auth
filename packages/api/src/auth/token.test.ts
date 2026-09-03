import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from './token.js';

describe('session and verification tokens', () => {
  /* 32 random bytes is the security property. base64url of 32 bytes is 43 chars unpadded, so a
     shorter token means fewer bytes were drawn, which no other assertion here would notice. */
  it('carries 32 bytes of randomness', () => {
    expect(generateToken()).toHaveLength(43);
  });

  // These ride in cookies and URLs, where + / and = do not survive intact.
  it('uses only url-safe characters, unpadded', () => {
    for (let i = 0; i < 200; i++) expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 500 }, generateToken));
    expect(seen.size).toBe(500);
  });

  it('hashes to the published SHA-256 of the input', async () => {
    expect(await hashToken('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is stable, so a token still finds its own row', async () => {
    const token = generateToken();
    expect(await hashToken(token)).toBe(await hashToken(token));
  });

  it('separates tokens that differ by one character', async () => {
    expect(await hashToken('token-a')).not.toBe(await hashToken('token-b'));
  });

  /*
   * Every byte hex-encodes to two characters. Dropping the pad on bytes under 0x10 would shorten
   * the hash and, worse, make two different digests collide on the same string.
   */
  it('pads every byte, so the hash is always 64 characters', async () => {
    for (let i = 0; i < 200; i++) {
      expect(await hashToken(generateToken())).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
