import { describe, expect, it } from 'vitest';
import { isFamiliarSignIn, signInAlertEmail } from './signInAlert.js';

describe('new-device sign-in alerts', () => {
  const now = Date.parse('2026-08-11T12:00:00.000Z');

  it('keeps a recent matching device and location quiet', () => {
    expect(isFamiliarSignIn([{
      device: 'Safari on iOS',
      location: 'New York, US',
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    }], { device: 'Safari on iOS', location: 'New York, US' }, now)).toBe(true);
  });

  it('alerts for a changed location or a fingerprint older than 30 days', () => {
    const events = [{
      device: 'Chrome on macOS',
      location: 'Boston, US',
      createdAt: new Date(now - 31 * 24 * 60 * 60 * 1000),
    }];
    expect(isFamiliarSignIn(events, { device: 'Chrome on macOS', location: 'Boston, US' }, now)).toBe(false);
    expect(isFamiliarSignIn(events, { device: 'Chrome on macOS', location: 'Chicago, US' }, now)).toBe(false);
  });

  it('escapes metadata before placing it in the email', () => {
    const { html } = signInAlertEmail(
      { device: '<script>alert(1)</script>', location: 'A&B' },
      'https://accounts.example/account?x=1&y=2',
      'password',
      new Date(now),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('x=1&amp;y=2');
  });

  const meta = { device: 'Chrome on macOS', location: 'Boston, US' };

  it.each([
    ['password', 'Password'],
    ['google', 'Google'],
    ['passkey', 'Passkey'],
  ] as const)('names the %s method in the alert', (method, label) => {
    const { text } = signInAlertEmail(meta, 'https://accounts.example/account', method, new Date(now));
    expect(text).toContain(`How: ${label}`);
  });

  it('leaves out the method when the sign-in predates recording it', () => {
    const { text } = signInAlertEmail(meta, 'https://accounts.example/account', undefined, new Date(now));
    expect(text).not.toContain('How:');
  });
});
