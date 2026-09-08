// The launcher list. Adding an app is one entry here, no page edits.

export interface AppLink {
  /** Display name, always lower case. apps.test.ts holds the line. */
  name: string;
  /** A few words on what it does, in the app's voice. */
  tagline: string;
  /** Production URL (custom domain). */
  url: string;
  /** Used instead of `url` when the account UI is itself on localhost. */
  devUrl: string;
  /** Accent colour: the launcher dot, and the panel tint after ?return_to. Take the app's own hue
   *  but a tint light enough to read on the dark card here, which several apps' UI accents are not
   *  (owewell's #4f46e5 lands at 2.94:1). theme.test.ts enforces the floor. */
  accent: string;
}

export const APPS: AppLink[] = [
  {
    name: 'owewell',
    tagline: 'split bills, keep friends',
    url: 'https://owewell.aidenjang.com',
    devUrl: 'http://localhost:30001',
    // Don't "correct" this to owewell's own tile #1f6f4f. It reaches 3.04 here and fails the test.
    accent: '#a78bfa',
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
    name: 'mrrp',
    tagline: "she's the cat, you look after her",
    url: 'https://mrrp.aidenjang.com',
    devUrl: 'http://localhost:30005',
    accent: '#e0a03f',
  },
  {
    name: 'iguess',
    tagline: 'draw it, an AI guesses',
    url: 'https://iguess.aidenjang.com',
    devUrl: 'http://localhost:33100',
    accent: '#a855f7',
  },
  {
    name: 'everything is fine',
    tagline: 'quakes, storms and aurora, live',
    url: 'https://everythingisfine.aidenjang.com',
    devUrl: 'http://localhost:31600',
    // Nearly grey on purpose. The app's whole palette is desaturated; there is no brighter hue.
    accent: '#5b8fb0',
  },
];

/** True when the account UI is being served from a local dev origin. */
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/** Locally, link to the app's dev server so clicking through does not jump to production. */
export function appHref(app: AppLink): string {
  return isLocalHost() ? app.devUrl : app.url;
}
