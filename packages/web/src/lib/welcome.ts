import type { RecentAccount } from './recentAccount';

/**
 * Shown before anybody has authenticated, possibly on a borrowed machine. May use the fact that *an*
 * account was used here; must never name one, not even masked.
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
  // Not "Good night", which is a farewell; 3am here is somebody starting something.
  night: 'Still up',
};

export interface Welcome {
  greeting: string;
  /** Only when this device has been here before. Never names an account. */
  note: string | null;
}

/** @param recents used only as a count. */
export function welcome(recents: RecentAccount[], now = new Date()): Welcome {
  const greeting = GREETING[partOfDay(now)];
  if (recents.length === 0) {
    // No claim about history on a first visit.
    return { greeting, note: null };
  }
  return {
    greeting,
    // "This device", not "you": the device is what we recognise, and we do not know who is holding it.
    note:
      recents.length === 1
        ? 'This device has been here before.'
        : 'You have signed in here before.',
  };
}

export function welcomeLine(recents: RecentAccount[], now = new Date()): string {
  const { greeting, note } = welcome(recents, now);
  return note ? `${greeting}. ${note}` : `${greeting}.`;
}
