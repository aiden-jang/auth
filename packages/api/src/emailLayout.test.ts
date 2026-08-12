import { describe, expect, it } from 'vitest';
import { escapeHtml, readableTime, renderEmail } from './emailLayout.js';

/* Structural checks target known email-client behaviour; the escaping ones are a security property. */

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
    const { html } = basic();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<html lang="en">');
  });

  it('lays out with tables and inline styles, because that is what email supports', () => {
    const { html } = basic();
    expect(html).toContain('role="presentation"');
    // Several clients strip <style>, so nothing may depend on one.
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');
  });

  it('loads nothing from anywhere', () => {
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
    // Padded, or some clients run the preview into the real text.
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
    // Tag-free paragraphs let the tag stripper be deleted without a test noticing.
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
    // Once in the anchor, once in the footer. Both, not just the first.
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
    expect(readableTime(new Date('2026-01-02T23:05:00.000Z'))).toContain('UTC');
  });

  it('is stable wherever the worker happens to run', () => {
    // Explicit UTC, so the same instant does not print differently per region.
    const at = new Date('2026-12-31T23:59:00.000Z');
    expect(readableTime(at)).toBe('31 December 2026 at 23:59 UTC');
  });
});
