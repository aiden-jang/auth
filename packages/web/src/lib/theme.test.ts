import { beforeAll, describe, expect, it, vi } from 'vitest';
import { APP_ACCENTS, CANVAS, CARD, contrast, luminance, readableOn, themeFor, themeStyle, type Hex } from './theme';
import { returnAppFor } from './returnTo';

/*
 * A theme that fails contrast is not a style preference, it is a page somebody cannot read.
 *
 * These accents were each picked against their own app's background: bloomnote's pink against cream,
 * wherever's amber against a dark aubergine. Dropping them onto this page is exactly the situation where
 * one of them quietly stops being legible, so every app in the launcher is checked rather than the two
 * that were looked at by eye.
 *
 * These run in vitest's node environment, which has no `window`, and `safeReturnTo` resolves relative
 * URLs against `window.location.origin`. Without the stub below every return target resolves to null,
 * which makes the "refuses a hostile return_to" test pass while proving nothing at all.
 */

beforeAll(() => {
  vi.stubGlobal('window', { location: { origin: 'https://accounts.aidenjang.com', hostname: 'accounts.aidenjang.com' } });
});

describe('the contrast maths', () => {
  it('agrees with the values WCAG defines', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Symmetric: the order of the arguments is not part of the answer.
    expect(contrast('#8b7bff', CARD)).toBeCloseTo(contrast(CARD, '#8b7bff'), 10);
  });

  it('refuses a colour it cannot read rather than returning a plausible number', () => {
    // A silent NaN here would sail through every threshold comparison below as `false`.
    expect(() => luminance('#fff' as Hex)).toThrow();
    expect(() => luminance('nonsense' as Hex)).toThrow();
  });

  it('picks the readable foreground rather than always white', () => {
    expect(readableOn('#fbbf24')).toBe('#09090f'); // amber wants dark ink
    expect(readableOn('#1f2937')).toBe('#ffffff'); // slate wants white
  });
});

describe('every app in the launcher', () => {
  it.each(APP_ACCENTS)('gives $name an accent readable on the card', ({ accent }) => {
    const theme = themeFor({ name: 'x', accent });
    expect(contrast(theme.accent, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(APP_ACCENTS)('gives $name a readable foreground on its own accent', ({ accent }) => {
    const theme = themeFor({ name: 'x', accent });
    expect(contrast(theme.accent, theme.accentInk)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(APP_ACCENTS)('keeps $name recognisable rather than washing it to white', ({ accent }) => {
    /*
     * The lightening loop is the risk in this file.
     *
     * Raising lightness until a colour passes will always terminate at white, and a page themed white is
     * not themed at all. Every accent has to stay closer to itself than to paper.
     */
    const theme = themeFor({ name: 'x', accent });
    expect(contrast(theme.accent, accent)).toBeLessThan(contrast(theme.accent, '#ffffff'));
  });

  /*
   * The gradient, not just the accent.
   *
   * The button label is one colour across two stops, so checking it against the accent alone would pass
   * while the far end of the gradient made the text unreadable. Both ends are checked.
   */
  it.each(APP_ACCENTS)('gives $name a button label readable at both ends of the gradient', ({ accent }) => {
    const theme = themeFor({ name: 'x', accent });
    expect(contrast(theme.buttonFrom, theme.accentInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.buttonTo, theme.accentInk)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(APP_ACCENTS)('keeps $name a gradient rather than two identical stops', ({ accent }) => {
    const theme = themeFor({ name: 'x', accent });
    expect(theme.buttonTo).not.toBe(theme.buttonFrom);
  });

  it('leaves the current accents alone, since they already read here', () => {
    // Documents why the lightening path below is tested with colours no app uses: today none needs it.
    for (const { name, accent } of APP_ACCENTS) {
      expect(themeFor({ name, accent }).accent, name).toBe(accent);
    }
  });

  it('reads on the canvas too, not only the card', () => {
    // Some of these land on the gradient background rather than inside a card.
    for (const { name, accent } of APP_ACCENTS) {
      const theme = themeFor({ name, accent });
      expect(contrast(theme.accent, CANVAS), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('choosing a theme', () => {
  it('falls back to the house colour when nobody sent you', () => {
    expect(themeFor(null).app).toBeNull();
    expect(contrast(themeFor(null).accent, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * The security property, not a styling one.
   *
   * A theme taken from the query string turns this page into one that can wear any brand, which is the
   * whole mechanism of a convincing fake login. The colour is reachable only through returnAppFor, which
   * resolves against the app whitelist, so an attacker-controlled return_to gets the house purple.
   */
  it('will not wear a colour from an unrecognised return target', () => {
    for (const hostile of [
      'https://evil.example.com',
      'https://aidenjang.com.evil.example.com',
      'javascript:alert(1)',
      'https://bloomnote.aidenjang.com.evil.example.com',
    ]) {
      expect(returnAppFor(hostile), hostile).toBeNull();
      expect(themeFor(returnAppFor(hostile)).accent).toBe(themeFor(null).accent);
    }
  });

  it('wears a real app colour when the return target is genuinely ours', () => {
    const app = returnAppFor('https://bloomnote.aidenjang.com/journal');
    expect(app?.name).toBe('bloomnote');
    expect(themeFor(app).app).toBe('bloomnote');
    expect(themeFor(app).accent).not.toBe(themeFor(null).accent);
  });

  /*
   * The lightening path, which no accent in APPS currently reaches.
   *
   * That makes it the code most likely to be wrong when it finally matters: a future app with a deep
   * accent is exactly when a broken fallback ships unnoticed. These force it with colours nobody uses.
   */
  it('raises a too-dark accent until it can be read', () => {
    const deep = themeFor({ name: 'deep', accent: '#1a2340' });
    expect(contrast('#1a2340', CARD)).toBeLessThan(4.5); // the premise
    expect(contrast(deep.accent, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(deep.accent).not.toBe('#1a2340');
  });

  it('gets even black to readable rather than giving up part-way', () => {
    // The loop is bounded, so the bound has to be enough for the worst input rather than nearly enough.
    expect(contrast(themeFor({ name: 'void', accent: '#000000' }).accent, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('survives a malformed accent instead of rendering an unstyled page', () => {
    // APPS is hand-maintained, so a typo in a hex is a plausible future edit.
    const theme = themeFor({ name: 'broken', accent: 'not-a-colour' });
    expect(contrast(theme.accent, CARD)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('applying it', () => {
  it('exposes both colours as custom properties', () => {
    const style = themeStyle(themeFor({ name: 'wherever', accent: '#fbbf24' }));
    expect(style['--color-accent']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(style['--color-accent-ink']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('names only variables the stylesheet already defines', () => {
    // A typo'd custom property fails silently and leaves the page on the house colour.
    expect(Object.keys(themeStyle(themeFor(null)))).toEqual([
      '--color-accent',
      '--color-accent-ink',
      '--btn-from',
      '--btn-to',
    ]);
  });
});
