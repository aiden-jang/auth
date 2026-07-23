import { describe, expect, test } from 'vitest';
import { loginUrl, logoutUrl, signupUrl } from './index.js';

describe('auth-client URLs', () => {
  test('loginUrl carries an encoded return_to', () => {
    expect(loginUrl('https://accounts.aidenjang.com', 'https://owewell.aidenjang.com/groups')).toBe(
      'https://accounts.aidenjang.com/login?return_to=https%3A%2F%2Fowewell.aidenjang.com%2Fgroups',
    );
  });

  test('signupUrl points at /signup with return_to (distinct from login)', () => {
    expect(signupUrl('https://accounts.aidenjang.com', 'https://owewell.aidenjang.com/groups')).toBe(
      'https://accounts.aidenjang.com/signup?return_to=https%3A%2F%2Fowewell.aidenjang.com%2Fgroups',
    );
  });

  test('logoutUrl points at /logout with return_to', () => {
    expect(logoutUrl('https://accounts.aidenjang.com', 'https://owewell.aidenjang.com')).toBe(
      'https://accounts.aidenjang.com/logout?return_to=https%3A%2F%2Fowewell.aidenjang.com',
    );
  });
});
