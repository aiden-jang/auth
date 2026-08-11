import { describe, expect, it } from 'vitest';
import { credentialAlertHtml, credentialAlertSubject } from './credentialAlert.js';

const AT = new Date('2026-08-11T09:30:00.000Z');
const META = { device: 'iPhone', location: 'Jersey City, US' };

describe('credential change alerts', () => {
  it('names the specific change rather than saying something changed', async () => {
    const added = credentialAlertHtml('password_added', META, 'https://a.test/account', AT);
    const changed = credentialAlertHtml('password_changed', META, 'https://a.test/account', AT);
    const unlinked = credentialAlertHtml('google_disconnected', META, 'https://a.test/account', AT);

    // "Something changed" is useless in an inbox: the whole job of this mail is letting the owner
    // decide in one read whether it was them, and that needs the actual verb.
    expect(added).toContain('added a password');
    expect(changed).toContain('changed the password');
    expect(unlinked).toContain('unlinked Google');
    expect(new Set([added, changed, unlinked]).size).toBe(3);
  });

  it('tells you what to do, differently per change', async () => {
    expect(credentialAlertHtml('password_added', META, 'https://a.test/account', AT)).toContain(
      'change that password immediately',
    );
    expect(credentialAlertHtml('google_disconnected', META, 'https://a.test/account', AT)).toContain(
      'link Google again',
    );
  });

  it('carries the device, place and time so it can be recognised', async () => {
    const html = credentialAlertHtml('password_changed', META, 'https://a.test/account', AT);
    expect(html).toContain('iPhone');
    expect(html).toContain('Jersey City, US');
    expect(html).toContain('2026-08-11T09:30:00.000Z');
  });

  it('says so plainly when device or place are unknown', async () => {
    const html = credentialAlertHtml('password_changed', {}, 'https://a.test/account', AT);
    expect(html).toContain('Unknown device');
    expect(html).toContain('Location unavailable');
  });

  /*
   * Device and location are derived from request headers, so they are attacker-controlled strings
   * being pasted into an HTML email. Unescaped, a crafted device name turns the "was this you?"
   * mail into a phishing page hosted in the victim's own inbox, which is a nastier outcome than the
   * account change it is warning about.
   */
  it('escapes device and location instead of trusting them', async () => {
    const html = credentialAlertHtml(
      'password_changed',
      { device: '<script>alert(1)</script>', location: '"><a href="https://evil.test">click</a>' },
      'https://a.test/account',
      AT,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the account link too', async () => {
    const html = credentialAlertHtml('password_changed', META, 'https://a.test/"><script>x</script>', AT);
    expect(html).not.toContain('<script>');
  });

  it('gives each change its own subject line', async () => {
    const subjects = (['password_added', 'password_changed', 'google_disconnected'] as const).map(
      credentialAlertSubject,
    );
    expect(new Set(subjects).size).toBe(3);
    for (const s of subjects) expect(s.length).toBeGreaterThan(10);
  });
});
