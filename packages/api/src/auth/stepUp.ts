import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { hashToken } from './token.js';

/*
 * Closes a takeover chain: from a stolen cookie, set a password (a Google-only account has none to ask
 * for), then cut the owner's Google link. Neither rule was wrong alone.
 */

/** Not extended by activity: a window since you last proved who you are, not since you last clicked. */
export const SUDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Milliseconds since this session last proved itself, or null if unknown.
 *
 * Falls back to `createdAt` for sessions predating the column: creating one did involve
 * authenticating, at that moment.
 */
export async function reauthAgeMs(db: DB, token: string): Promise<number | null> {
  const id = await hashToken(token);
  let row: { reauthAt: Date | null; createdAt: Date } | undefined;
  try {
    row = await db
      .select({ reauthAt: sessions.reauthAt, createdAt: sessions.createdAt })
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();
  } catch (error) {
    /*
     * Never take the whole service down over the freshness read.
     *
     * Not hypothetical caution: deploying the code that added `reauth_at` before running its migration
     * took the platform down. Writes threw outright (`no column named reauth_at`), so nobody could sign
     * in, and /auth/me 500d too, which every app calls to resolve identity.
     *
     * Whether a missing column throws here or comes back as an unusable value depends on the driver, so
     * both are handled: this catch, and the finite check below. Returning null means "cannot vouch for
     * this session", which callers treat as not fresh, so sensitive actions ask for a password again and
     * everything else keeps working. Asking more often is the safe direction to fail in.
     */
    console.error('[step-up] freshness read failed, treating session as unproven:', error);
    return null;
  }
  if (!row) return null;
  const provedAt = row.reauthAt ?? row.createdAt;
  const age = Date.now() - provedAt.getTime();
  /*
   * Null, never NaN. NaN fails `age >= WINDOW` too, so sudoUntil sailed past its bail-out and returned
   * `new Date(NaN)`, which /auth/me then called toISOString() on: a RangeError 500ing identity for
   * every app. Reachable from any row whose timestamp did not survive the round trip.
   */
  return Number.isFinite(age) ? age : null;
}

/** Whether this session proved itself inside the window. Unknown sessions are never fresh. */
export async function isFresh(db: DB, token: string): Promise<boolean> {
  const age = await reauthAgeMs(db, token);
  return age !== null && age < SUDO_WINDOW_MS;
}

/** Record that this session just proved itself. */
export async function stampReauth(db: DB, token: string): Promise<void> {
  const id = await hashToken(token);
  await db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, id));
}

/** When the current sudo window closes, for the UI to count down against. Null if not fresh. */
export async function sudoUntil(db: DB, token: string): Promise<Date | null> {
  const age = await reauthAgeMs(db, token);
  if (age === null || age >= SUDO_WINDOW_MS) return null;
  return new Date(Date.now() + (SUDO_WINDOW_MS - age));
}
