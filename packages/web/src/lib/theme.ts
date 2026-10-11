import { APPS } from './apps';
import type { ReturnApp } from './returnTo';

/*
 * Take the colour from APPS via `returnAppFor` only, never from a query parameter. A theme an attacker
 * can set is a login page that can wear any brand. Unrecognised return target gets the house butter.
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

export const CANVAS: Hex = '#181915';
export const CARD: Hex = '#20211c';
const HOUSE_ACCENT: Hex = '#e8dc9d';

const INK: Hex = '#181915';
const PAPER: Hex = '#ffffff';

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

/** Each APPS accent was picked against its own app's background, so a deep one can fail AA here. */
function legibleOnCard(accent: Hex): Hex {
  let candidate = accent;
  for (let step = 0; step < 20 && contrast(candidate, CARD) < 4.5; step += 1) {
    candidate = mix(candidate, PAPER, 0.08);
  }
  return candidate;
}

export interface Theme {
  accent: Hex;
  accentInk: Hex;
  /** Null for the house theme. */
  app: string | null;
}

/** The theme for a verified return app, or the house theme. */
export function themeFor(app: ReturnApp | null): Theme {
  const source = (app?.accent ?? HOUSE_ACCENT) as Hex;
  let accent: Hex;
  try {
    accent = legibleOnCard(source);
  } catch {
    // A malformed hex in APPS is a bug, not a reason to render an unstyled page.
    accent = HOUSE_ACCENT;
  }
  return {
    accent,
    accentInk: readableOn(accent),
    app: app?.name ?? null,
  };
}

/** Set these on a wrapper, never on documentElement: the root keeps the theme across a route change. */
export function themeStyle(theme: Theme): Record<string, string> {
  return {
    '--color-accent': theme.accent,
    '--color-accent-ink': theme.accentInk,
  };
}

/** Exported so the contrast tests cover every accent the launcher can hand this page. */
export const APP_ACCENTS = APPS.map((app) => ({ name: app.name, accent: app.accent as Hex }));
