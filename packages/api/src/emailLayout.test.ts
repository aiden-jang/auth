import { describe, expect, it } from 'vitest';
import { escapeHtml, readableTime, renderEmail } from './emailLayout.js';

/*
 * The shell every email goes through, so a defect here is a defect in all six.
 *
 * Two things are worth pinning down. Email clients are unforgiving in specific, well-known ways, so the
 * structural checks are about those rather than about looking nice. And every template pastes
 * attacker-influenced strings (a device name, a location) into markup, so the escaping is a security
 * property, not tidiness.
 */

const basic = () =>
  renderEmail({
    preheader: 'Confirm this address.',
    heading: 'Confirm your email',
    paragraphs: ['One tap and you are done.'],
    action: { label: 'Confirm my email', url: 'https://accounts.test/verify?token=abc' },
    footnote: 'This link lasts 24 hours.',
  });

describe('the document', () => {
  it('is a whole document, not a fragment', () => {
    // The old templates were bare <p> tags: no doctype and no charset, which renders as unstyled
    // Times New Roman and mangles any non-ASCII in a name.
    const { html } = basic();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<html lang="en">');
  });

  it('lays out with tables and inline styles, because that is what email supports', () => {
    const { html } = basic();
    expect(html).toContain('role="presentation"');
    // A <style> block is stripped by several clients, so nothing may depend on one.
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');
  });

  it('loads nothing from anywhere', () => {
    /*
     * No image, no webfont, no stylesheet.
     *
     * A remote image in an email is a tracking pixel whether or not it was meant as one, and it is the
     * first thing a client blocks, which is precisely when somebody is deciding if the mail is genuine.
     */
    const { html } = basic();
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/@import|url\(https?:/i);
    // The only absolute URLs are the ones the reader is meant to click.
    const urls = [...html.matchAll(/https?:\/\/[^"'\s<]+/g)].map((match) => match[0]);
    expect(new Set(urls)).toEqual(new Set(['https://accounts.test/verify?token=abc']));
  });

  it('has a preview line so the inbox does not improvise one', () => {
    const { html } = basic();
    expect(html).toContain('Confirm this address.');
    // Hidden in the body, and padded, or some clients run it into the real text.
    expect(html).toMatch(/display:none[^"]*mso-hide:all/);
    expect(html).toContain('&zwnj;');
  });

  it('tells a dark-mode client not to invert it', () => {
    expect(basic().html).toContain('name="color-scheme" content="light only"');
  });
});

describe('the action', () => {
  it('is a table, because Outlook ignores padding on a link', () => {
    const { html } = basic();
    const button = html.slice(html.indexOf('bgcolor='));
    expect(button).toContain('<a href="https://accounts.test/verify?token=abc"');
  });

  it('spells the link out as well, for when the button does not render', () => {
    // A button somebody cannot preview is a button somebody should not press.
    expect(basic().html).toContain('If the button does not work, paste this into your browser');
  });

  it('leaves the button out entirely when there is nothing to do', () => {
    const { html } = renderEmail({ preheader: 'p', heading: 'h', paragraphs: ['body'] });
    expect(html).not.toContain('bgcolor=');
    expect(html).not.toContain('If the button does not work');
  });
});

describe('the plain-text part', () => {
  it('exists, and is actually plain', () => {
    const { text } = basic();
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).toContain('Confirm your email');
    expect(text).toContain('One tap and you are done.');
  });

  it('strips markup that is not a link', () => {
    // Body copy carries the odd <strong>. Checking only against tag-free paragraphs let the tag
    // stripper be deleted without a single test noticing.
    const { text } = renderEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['Somebody <strong>changed your password</strong> just now.'],
    });
    expect(text).toContain('Somebody changed your password just now.');
    expect(text).not.toContain('<strong>');
  });

  it('carries the link, since a text reader cannot click a button', () => {
    expect(basic().text).toContain('Confirm my email: https://accounts.test/verify?token=abc');
  });

  it('turns an inline link into readable text plus its url', () => {
    const { text } = renderEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: ['See <a href="https://accounts.test/account">your account</a> for details.'],
    });
    expect(text).toContain('See your account (https://accounts.test/account) for details.');
  });

  it('unescapes entities, which are markup and not content', () => {
    const { text } = renderEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: [escapeHtml('Ben & Jerry\'s <device>')],
    });
    expect(text).toContain("Ben & Jerry's <device>");
    expect(text).not.toContain('&amp;');
  });

  it('lists the facts a security alert turns on', () => {
    const { text } = renderEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: [],
      facts: [{ label: 'Device', value: 'Chrome on macOS' }],
    });
    expect(text).toContain('Device: Chrome on macOS');
  });
});

describe('escaping', () => {
  /*
   * Device and location come from request headers, so they are attacker-influenced strings being
   * pasted into an HTML email. Unescaped, a crafted device name turns a "was this you?" alert into a
   * phishing page hosted inside the victim's own inbox.
   */
  it('escapes every value the layout places for a caller', () => {
    const { html } = renderEmail({
      preheader: '<script>a</script>',
      heading: '<script>b</script>',
      paragraphs: [],
      facts: [{ label: '<script>c</script>', value: '<script>d</script>' }],
      action: { label: '<script>e</script>', url: 'https://x.test/?a=1&b=2"><script>f</script>' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the url in both the href and the spelled-out copy', () => {
    const { html } = renderEmail({
      preheader: 'p',
      heading: 'h',
      paragraphs: [],
      action: { label: 'Go', url: 'https://x.test/?a=1&b=2' },
    });
    // Once in the anchor, once in the footer. Both must be escaped, not just the first.
    expect(html.match(/a=1&amp;b=2/g)).toHaveLength(2);
    expect(html).not.toContain('a=1&b=2');
  });

  it('covers the characters that matter and leaves the rest alone', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml('Chrome on macOS')).toBe('Chrome on macOS');
  });
});

describe('the time', () => {
  it('reads like a time and not like a log line', () => {
    expect(readableTime(new Date('2026-08-11T09:30:00.000Z'))).toBe('11 August 2026 at 09:30 UTC');
  });

  it('names the zone, because the service does not know the reader’s', () => {
    // Guessing a timezone on a security alert is worse than being explicit about UTC.
    expect(readableTime(new Date('2026-01-02T23:05:00.000Z'))).toContain('UTC');
  });

  it('is stable wherever the worker happens to run', () => {
    // Formatted in UTC explicitly, so the same instant does not print differently per region.
    const at = new Date('2026-12-31T23:59:00.000Z');
    expect(readableTime(at)).toBe('31 December 2026 at 23:59 UTC');
  });
});
