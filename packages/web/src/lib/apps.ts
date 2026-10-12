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
  /** Accent colour: the launcher dot and the panel tint after ?return_to. The app's own hue, but a
   *  tint that reads on this dark card. theme.test.ts holds the contrast floor. */
  accent: string;
}

export const APPS: AppLink[] = [
  {
    name: 'worth',
    tagline: 'the good, the meh, the not again',
    url: 'https://worth.aidenjang.com',
    devUrl: 'http://localhost:34300',
    accent: '#e8dc9d',
  },
  {
    name: 'owewell',
    tagline: 'split bills, keep friends',
    url: 'https://owewell.aidenjang.com',
    devUrl: 'http://localhost:30001',
    // A lighter teal keeps owewell recognizable on the shared dark sign-in surface.
    accent: '#8ac8c5',
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
