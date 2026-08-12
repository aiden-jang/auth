import { APPS } from './apps';
import type { ReturnApp } from './returnTo';

/*
 * The sign-in page wearing the colours of the app that sent you.
 *
 * Arriving at a generic purple form from bloomnote's garden is a small break in the illusion that these
 * are one product, and it is also the moment people are deciding whether this login is legitimate. So the
 * page takes the accent of the app it will return you to.
 *
 * The colour comes from APPS, reached only through `returnAppFor`, which validates the return URL against
 * that same list. That matters more than it looks: a theme derived from a query parameter is a way to make
 * this page impersonate anything, and a convincing fake login page is the entire game. An unrecognised
 * return target gets the house purple, which is the honest answer to "we do not know who sent you".
 */

export type Hex = `#${string}`;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgb(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: Hex): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 1 (identical) to 21 (black on white). AA wants 4.5 for body text and 3 for large text or UI edges. */
export function contrast(a: Hex, b: Hex): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/** The page's own colours, which a theme has to stay readable against. */
export const CANVAS: Hex = '#09090f';
export const CARD: Hex = '#14121e';
const HOUSE_ACCENT: Hex = '#8b7bff';

const INK: Hex = '#09090f';
const PAPER: Hex = '#ffffff';

/** Whichever of near-black or white is more readable on this colour. */
export function readableOn(background: Hex): Hex {
  return contrast(background, INK) >= contrast(background, PAPER) ? INK : PAPER;
}

function mix(from: Hex, to: Hex, amount: number): Hex {
  const [ar, ag, ab] = rgb(from);
  const [br, bg, bb] = rgb(to);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(blend(ar, br))}${hex(blend(ag, bg))}${hex(blend(ab, bb))}`;
}

/**
 * Lighten a colour until it is readable as text on the dark card.
 *
 * Needed because the accents in APPS were each chosen against their own app's background, not against
 * this one. A deep accent that reads beautifully on white can fall under 4.5:1 here, and the fix is to
 * keep the hue and raise the lightness rather than to quietly drop the theme.
 */
function legibleOnCard(accent: Hex): Hex {
  let candidate = accent;
  for (let step = 0; step < 20 && contrast(candidate, CARD) < 4.5; step += 1) {
    candidate = mix(candidate, PAPER, 0.08);
  }
  return candidate;
}

export interface Theme {
  /** For text, borders and tints on the dark card. Guaranteed AA against it. */
  accent: Hex;
  /** Foreground for solid accent surfaces, chosen for contrast rather than assumed. */
  accentInk: Hex;
  /** The two stops of the primary button's gradient, both derived from the accent. */
  buttonFrom: Hex;
  buttonTo: Hex;
  /** The app this belongs to, or null for the house theme. */
  app: string | null;
}

/**
 * The theme for a verified return app, or the house theme.
 *
 * Two separate colours rather than one: the same accent has to work as text on a near-black card and as a
 * background behind a label, and no single hex is guaranteed to do both. Deriving each independently is
 * what makes the AA guarantee hold for every app in the list rather than for the ones that happened to
 * look fine.
 */
export function themeFor(app: ReturnApp | null): Theme {
  const source = (app?.accent ?? HOUSE_ACCENT) as Hex;
  let accent: Hex;
  try {
    accent = legibleOnCard(source);
  } catch {
    // A malformed hex in APPS is a bug, not a reason to render an unstyled page.
    accent = HOUSE_ACCENT;
  }
  /*
   * The button keeps its gradient rather than going flat.
   *
   * The second stop is the accent lifted toward white, so a themed button still reads as the same
   * component wearing a different colour. One ink is derived from the darker stop and used across both,
   * which is sound here rather than merely convenient: an accent that clears 4.5:1 against a near-black
   * card is already light, and lifting it toward white cannot push it back across the threshold where
   * the readable foreground flips. `theme.test.ts` checks the label against both ends regardless, so if
   * that premise ever stops holding it fails there rather than shipping an unreadable button.
   */
  const buttonTo = mix(accent, PAPER, 0.3);
  return { accent, accentInk: readableOn(accent), buttonFrom: accent, buttonTo, app: app?.name ?? null };
}

/**
 * The theme as CSS custom properties, for a wrapper element.
 *
 * Set on a wrapper rather than on `document.documentElement`, so the theme cannot outlive the page that
 * asked for it. Writing to the root leaves bloomnote's pink on the account page after the redirect, which
 * is exactly the kind of state that survives a client-side route change and looks like a rendering bug.
 */
export function themeStyle(theme: Theme): Record<string, string> {
  return {
    '--color-accent': theme.accent,
    '--color-accent-ink': theme.accentInk,
    '--btn-from': theme.buttonFrom,
    '--btn-to': theme.buttonTo,
  };
}

/** Every accent the launcher can hand this page. Exported so the contrast tests cover all of them. */
export const APP_ACCENTS = APPS.map((app) => ({ name: app.name, accent: app.accent as Hex }));
