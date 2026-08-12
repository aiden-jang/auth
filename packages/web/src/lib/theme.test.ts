import { beforeAll, describe, expect, it, vi } from 'vitest';
import { APP_ACCENTS, CANVAS, CARD, contrast, luminance, readableOn, themeFor, themeStyle, type Hex } from './theme';
import { returnAppFor } from './returnTo';

/*
 * The window stub is load-bearing. Without it `safeReturnTo` returns null for everything, and the
 * hostile-return_to test passes while proving nothing.
 */

beforeAll(() => {
  vi.stubGlobal('window', { location: { origin: 'https://accounts.aidenjang.com', hostname: 'accounts.aidenjang.com' } });
});

describe('the contrast maths', () => {
  it('agrees with the values WCAG defines', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#8b7bff', CARD)).toBeCloseTo(contrast(CARD, '#8b7bff'), 10);
  });

  it('refuses a colour it cannot read rather than returning a plausible number', () => {
    // A silent NaN sails through every threshold comparison below as `false`.
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
    // Lightening until a colour passes always terminates at white, which is not a theme.
    const theme = themeFor({ name: 'x', accent });
    expect(contrast(theme.accent, accent)).toBeLessThan(contrast(theme.accent, '#ffffff'));
  });

  // One label colour across two stops, so checking the accent alone misses the far end.
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
    // Why the lightening path is tested with colours no app uses: today none needs it.
    for (const { name, accent } of APP_ACCENTS) {
      expect(themeFor({ name, accent }).accent, name).toBe(accent);
    }
  });

  it('reads on the canvas too, not only the card', () => {
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

  // A theme an attacker can set is a login page that can wear any brand.
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

  // No accent in APPS reaches the lightening path, so it is the code most likely to be wrong when a
  // future app finally needs it. Forced here with colours nobody uses.
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
