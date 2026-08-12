import type { RecentAccount } from './recentAccount';

/**
 * The small line above the sign-in form.
 *
 * The point is that arriving somewhere feels different from being processed by it. A returning device is
 * a fact we already hold locally, and the time of day is free, so together they cost nothing and make the
 * page read as a door rather than a form.
 *
 * The hard constraint: **this line is shown before anybody has authenticated**, on a screen that may be a
 * shared or borrowed machine. So it may use the fact that *an* account was used here, and it must never
 * name one. `recentAccount` already masks emails for the switcher below; this does not even go that far,
 * because "welcome back, a•••@gmail.com" on a friend's laptop tells the friend something that is not
 * theirs to know.
 */

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function partOfDay(now = new Date()): PartOfDay {
  const hour = now.getHours();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const GREETING: Record<PartOfDay, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  // Not "Good night", which is a farewell. Somebody signing in at 3am is starting something, not ending it.
  night: 'Still up',
};

export interface Welcome {
  /** The greeting itself, always safe to show. */
  greeting: string;
  /** A second clause only when this device has been here before. Never names an account. */
  note: string | null;
}

/**
 * @param recents accounts remembered on this device, used only as a count.
 * @param now injected so the greeting is testable rather than dependent on when the suite runs.
 */
export function welcome(recents: RecentAccount[], now = new Date()): Welcome {
  const greeting = GREETING[partOfDay(now)];
  if (recents.length === 0) {
    // A first visit gets no claim about history, because inventing familiarity is worse than not having it.
    return { greeting, note: null };
  }
  return {
    greeting,
    // "This device" rather than "you": the device is what we actually recognise, and saying so is both
    // more honest and less presumptuous about who is holding it. Sentence case, because auth speaks in
    // sentences (bloomnote is the lowercase one) and a lowercase clause after a full stop reads as a typo.
    note: recents.length === 1 ? 'This device has been here before.' : 'You have signed in here before.',
  };
}

/** The whole line, for the one place that renders it. */
export function welcomeLine(recents: RecentAccount[], now = new Date()): string {
  const { greeting, note } = welcome(recents, now);
  return note ? `${greeting}. ${note}` : `${greeting}.`;
}
