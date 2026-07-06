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
}

export const APPS: AppLink[] = [
  { name: 'owewell', tagline: 'split bills, keep friends', url: 'https://owewell.aidenjang.com' },
  { name: 'bloomnote', tagline: 'say it with a garden', url: 'https://bloomnote.aidenjang.com' },
  { name: 'wherever', tagline: 'everyone swipes, majority wins', url: 'https://wherever.aidenjang.com' },
  { name: 'is-it-a-dog', tagline: 'draw it, an AI guesses', url: 'https://is-it-a-dog.aidenjang.com' },
];
