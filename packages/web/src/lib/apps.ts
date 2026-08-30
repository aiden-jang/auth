// Single source of truth for the apps that live under aidenjang. The
// account hub renders this list as a launcher, so adding a new app is one
// entry here — no page edits needed.
//
// `tagline` stays short (a few words) so the launcher rows read at a glance.

export interface AppLink {
  /** Display name, always lower case. apps.test.ts holds the line. */
  name: string;
  /** A few words on what it does, in the app's voice. */
  tagline: string;
  /** Production URL (custom domain). */
  url: string;
  /** Local dev URL (the app's vite dev port), used when the account UI is
   *  itself being served from localhost. */
  devUrl: string;
  /** Accent colour: the launcher dot, and the panel tint after ?return_to. Take it from the app's
   *  own icon; theme.test.ts enforces the contrast floor. */
  accent: string;
}

export const APPS: AppLink[] = [
  {
    name: 'owewell',
    tagline: 'split bills, keep friends',
    url: 'https://owewell.aidenjang.com',
    devUrl: 'http://localhost:30001',
    // Don't "correct" this to owewell's own tile #1f6f4f. It reaches 3.04 here and fails the test.
    accent: '#34d399',
  },
  {
    name: 'bloomnote',
    tagline: 'say it with a garden',
    url: 'https://bloomnote.aidenjang.com',
    devUrl: 'http://localhost:32100',
    accent: '#ff8fa3',
  },
  {
    name: 'wherever',
    tagline: 'decide where to eat now',
    url: 'https://wherever.aidenjang.com',
    devUrl: 'http://localhost:5173',
    // The lime dot on its "W," icon. Keep it clear of mrrp's orange, or the two dots read as one.
    accent: '#d7ff3e',
  },
  {
    // The odd one out: mrrp has no accounts at all, so signing in changes nothing about it. It is
    // listed anyway because the launcher answers "what lives here", not "what reads your session".
    // A hub that silently omits an app is more confusing than one that includes an app which
    // happens not to need you signed in.
    name: 'mrrp',
    tagline: "she's the cat, you look after her",
    url: 'https://mrrp.aidenjang.com',
    devUrl: 'http://localhost:30005',
    accent: '#e8963f',
  },
  {
    name: 'iguess',
    tagline: 'draw it, an AI guesses',
    url: 'https://iguess.aidenjang.com',
    devUrl: 'http://localhost:33100',
    accent: '#818cf8',
  },
  {
    name: 'everything is fine',
    tagline: 'quakes, storms and aurora, live',
    url: 'https://everythingisfine.aidenjang.com',
    devUrl: 'http://localhost:31600',
    // Nearly grey on purpose. The app's whole palette is desaturated; there is no brighter hue.
    accent: '#c8d2e2',
  },
];

/** True when the account UI is being served from a local dev origin. */
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * URL to open for an app. When the account page is itself running locally we
 * link to the app's local dev server, so clicking through keeps you in your
 * local environment instead of jumping to production.
 */
export function appHref(app: AppLink): string {
  return isLocalHost() ? app.devUrl : app.url;
}
