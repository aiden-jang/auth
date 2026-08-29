// Single source of truth for the apps that live under aidenjang. The
// account hub renders this list as a launcher, so adding a new app is one
// entry here — no page edits needed.
//
// `tagline` stays short (a few words) so the launcher rows read at a glance.

export interface AppLink {
  /** Display name. Lower case, always: the launcher is a list of six of these and one capitalised
   *  name pulls the eye down the column for no reason. apps.test.ts holds the line. */
  name: string;
  /** A few words on what it does, in the app's voice. */
  tagline: string;
  /** Production URL (custom domain). */
  url: string;
  /** Local dev URL (the app's vite dev port), used when the account UI is
   *  itself being served from localhost. */
  devUrl: string;
  /** Accent colour (a small dot in the launcher + branded panel). Take it from the app's own
   *  icon so the dot matches what the app actually looks like; see apps.test.ts for the floor it
   *  has to clear on this dark card. */
  accent: string;
}

export const APPS: AppLink[] = [
  {
    name: 'owewell',
    tagline: 'split bills, keep friends',
    url: 'https://owewell.aidenjang.com',
    devUrl: 'http://localhost:30001',
    // Its icon tile is #1f6f4f, which only reaches 3.04 on this card. Same hue, lighter, so the
    // dot still reads as owewell's green.
    accent: '#34d399',
  },
  {
    name: 'bloomnote',
    tagline: 'say it with a garden',
    url: 'https://bloomnote.aidenjang.com',
    devUrl: 'http://localhost:32100',
    // The flower in its favicon.
    accent: '#ff8fa3',
  },
  {
    name: 'wherever',
    tagline: 'everyone swipes, majority wins',
    url: 'https://wherever.aidenjang.com',
    devUrl: 'http://localhost:5173',
    // The lime dot that ends the "W," in its icon. It was amber here, a colour its icon does not
    // contain, which put it 7 degrees from mrrp and made the two dots read as one.
    accent: '#d7ff3e',
  },
  {
    // The odd one out: mrrp has no accounts at all, so signing in changes nothing about it. It is
    // listed anyway because the launcher answers "what lives here", not "what reads your session".
    // A hub that silently omits an app is more confusing than one that includes an app which
    // happens not to need you signed in.
    name: 'mrrp',
    tagline: 'one of you is the cat',
    url: 'https://mrrp.aidenjang.com',
    devUrl: 'http://localhost:30005',
    // The cat's fur, the colour its icon is mostly made of.
    accent: '#e8963f',
  },
  {
    name: 'iguess',
    tagline: 'draw it, an AI guesses',
    url: 'https://iguess.aidenjang.com',
    devUrl: 'http://localhost:33100',
    // The light end of its violet gradient. It was sky blue here, which iguess has never been.
    accent: '#818cf8',
  },
  {
    name: 'everything is fine',
    // Not "everything happening": that word is already in the name, and the row read as a stutter.
    tagline: 'quakes, storms and aurora, live',
    url: 'https://everythingisfine.aidenjang.com',
    devUrl: 'http://localhost:31600',
    // Its palette is deliberately desaturated, so this is the star colour rather than an invented hue.
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
