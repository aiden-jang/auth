import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { hashToken } from './token.js';

/*
 * Step-up re-authentication, for the handful of actions that can cost somebody their account.
 *
 * A session cookie proves "this browser signed in at some point". That is enough to read your own
 * data or rename a device, and it is not enough to change how you sign in. The gap matters because
 * two individually-reasonable rules combined into a lockout:
 *
 *   1. set-password treated a live session as proof of ownership, since a Google-only account has
 *      no current password to ask for.
 *   2. disconnect-google is allowed once a password exists, so the owner can't be left with no way
 *      in.
 *
 * Run in order from a stolen cookie, that is: give the account a password the thief knows, then cut
 * the Google link the real owner uses. Neither step was wrong on its own. The chain was.
 *
 * So sensitive actions now require the session to have proved itself recently, and every credential
 * change emails the owner. Freshness shrinks the window a stolen cookie is useful in; the email is
 * the part that doesn't depend on us guessing correctly.
 */

/**
 * How long a re-authentication counts for.
 *
 * Long enough to change a password and unlink a provider without typing it twice, short enough that
 * a cookie lifted from a closed laptop is almost never inside it. Deliberately not extended by
 * activity: this is a window since you last proved who you are, not since you last clicked.
 */
export const SUDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Milliseconds since this session last proved itself, or null if the session is unknown.
 *
 * Falls back to `createdAt` when `reauthAt` is null, which is every session that predates the
 * column. That is the truthful reading rather than a lenient one: creating a session did involve
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
   * A non-finite age is "cannot vouch for this session", not "zero".
   *
   * Guarded here rather than at the callers, because the two of them fail in opposite directions and
   * only one is safe. isFresh does `age < WINDOW`, and NaN fails every comparison, so it correctly
   * refuses. sudoUntil does `age >= WINDOW` to bail out, which NaN also fails, so it sailed past the
   * guard and returned `new Date(NaN)` — and /auth/me calls toISOString() on that, which throws a
   * RangeError and 500s the endpoint every app uses to resolve identity.
   *
   * Reachable whenever the timestamp does not survive the round trip: a row written before the column
   * existed, a null created_at, a driver returning something unexpected. Returning null makes both
   * callers degrade the same safe way.
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
