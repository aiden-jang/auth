import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_CHANGES,
  credentialAlertEmail,
  credentialAlertSubject,
} from './credentialAlert.js';

const AT = new Date('2026-08-11T09:30:00.000Z');
const META = { device: 'iPhone', location: 'Jersey City, US' };

describe('credential change alerts', () => {
  it('names the specific change rather than saying something changed', async () => {
    const added = credentialAlertEmail('password_added', META, 'https://a.test/account', AT).html;
    const changed = credentialAlertEmail(
      'password_changed',
      META,
      'https://a.test/account',
      AT,
    ).html;
    const unlinked = credentialAlertEmail(
      'google_disconnected',
      META,
      'https://a.test/account',
      AT,
    ).html;

    // "Something changed" is useless in an inbox: the whole job of this mail is letting the owner
    // decide in one read whether it was them, and that needs the actual verb.
    expect(added).toContain('added a password');
    expect(changed).toContain('changed the password');
    expect(unlinked).toContain('unlinked Google');
    expect(new Set([added, changed, unlinked]).size).toBe(3);
  });

  it('tells you what to do, differently per change', async () => {
    expect(
      credentialAlertEmail('password_added', META, 'https://a.test/account', AT).html,
    ).toContain('change that password immediately');
    expect(
      credentialAlertEmail('google_disconnected', META, 'https://a.test/account', AT).html,
    ).toContain('link Google again');
  });

  it('carries the device, place and time so it can be recognised', async () => {
    const { html, text } = credentialAlertEmail(
      'password_changed',
      META,
      'https://a.test/account',
      AT,
    );
    for (const part of [html, text]) {
      expect(part).toContain('iPhone');
      expect(part).toContain('Jersey City, US');
    }
  });

  it('gives the time in a form somebody can read', async () => {
    const { html } = credentialAlertEmail('password_changed', META, 'https://a.test/account', AT);
    expect(html).not.toContain('2026-08-11T09:30:00.000Z');
    expect(html).toContain('11 August 2026');
    expect(html).toContain('UTC');
  });

  it('says so plainly when device or place are unknown', async () => {
    const html = credentialAlertEmail('password_changed', {}, 'https://a.test/account', AT).html;
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
    const html = credentialAlertEmail(
      'password_changed',
      { device: '<script>alert(1)</script>', location: '"><a href="https://evil.test">click</a>' },
      'https://a.test/account',
      AT,
    ).html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the account link too', async () => {
    const html = credentialAlertEmail(
      'password_changed',
      META,
      'https://a.test/"><script>x</script>',
      AT,
    ).html;
    expect(html).not.toContain('<script>');
  });

  /*
   * Walked over the whole set rather than a listed few. This mail is the safety net for changes we
   * may have reasoned about wrongly, so a change added without its own copy -- landing on another
   * change's wording, or on nothing -- is the failure that matters most here.
   */
  it('gives each change its own subject line', async () => {
    const subjects = CREDENTIAL_CHANGES.map(credentialAlertSubject);
    expect(new Set(subjects).size).toBe(CREDENTIAL_CHANGES.length);
    for (const s of subjects) expect(s.length).toBeGreaterThan(10);
  });

  it('describes each change in its own words, and says what to do about it', async () => {
    const bodies = CREDENTIAL_CHANGES.map(
      (kind) => credentialAlertEmail(kind, META, 'https://a.test/account', AT).text,
    );
    expect(new Set(bodies).size).toBe(CREDENTIAL_CHANGES.length);
  });

  // A passkey signs in without the password, so its alert has to say that rather than read as a
  // routine settings change.
  it('warns that a new passkey signs in on its own', async () => {
    const { text } = credentialAlertEmail('passkey_added', META, 'https://a.test/account', AT);
    expect(text).toContain('without your password');
  });
});
