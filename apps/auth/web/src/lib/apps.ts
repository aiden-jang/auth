// Single source of truth for the apps that live under aidenjang. The
// account hub renders this list as a launcher, so adding a new app is one
// entry here — no page edits needed.
//
// `tagline` stays short (a few words) so the launcher rows read at a glance.

export interface AppLink {
  /** Display name, matching the app's own lowercase wordmark. */
  name: string;
  /** A few words on what it does, in the app's voice. */
  tagline: string;
  /** Production URL (custom domain). */
  url: string;
  /** Local dev URL (the app's vite dev port), used when the account UI is
   *  itself being served from localhost. */
  devUrl: string;
  /** Accent color (a small dot in the launcher + branded panel). */
  accent: string;
}

export const APPS: AppLink[] = [
  {
    name: 'owewell',
    tagline: 'split bills, keep friends',
    url: 'https://owewell.aidenjang.com',
    devUrl: 'http://localhost:30001',
    accent: '#34d399',
  },
  {
    name: 'bloomnote',
    tagline: 'say it with a garden',
    url: 'https://bloomnote.aidenjang.com',
    devUrl: 'http://localhost:32100',
    accent: '#f472b6',
  },
  {
    name: 'wherever',
    tagline: 'everyone swipes, majority wins',
    url: 'https://wherever.aidenjang.com',
    devUrl: 'http://localhost:5173',
    accent: '#fbbf24',
  },
  {
    name: 'is-it-a-dog',
    tagline: 'draw it, an AI guesses',
    url: 'https://is-it-a-dog.aidenjang.com',
    devUrl: 'http://localhost:33100',
    accent: '#38bdf8',
  },
];

/** True when the account UI is being served from a local dev origin. */
export function isLocalHost(): boolean {
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
