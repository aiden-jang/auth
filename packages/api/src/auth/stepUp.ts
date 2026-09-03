import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { hashToken } from './token.js';

/* Closes a takeover chain: from a stolen cookie, set a password on a Google-only account, then cut
   the owner's Google link. Neither rule was wrong alone. */

/** Not extended by activity: a window since you last proved who you are, not since you last clicked. */
export const SUDO_WINDOW_MS = 10 * 60 * 1000;

/** Falls back to `createdAt`: creating a session did involve authenticating, at that moment. */
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
     * Never take the service down over the freshness read. Shipping `reauth_at` ahead of its
     * migration did exactly that: nobody could sign in and /auth/me 500d for every app.
     *
     * Null means "cannot vouch for this session", so sensitive actions ask again and the rest keeps
     * working. A missing column may throw here or return junk, hence the finite check below too.
     */
    console.error('[step-up] freshness read failed, treating session as unproven:', error);
    return null;
  }
  if (!row) return null;
  const provedAt = row.reauthAt ?? row.createdAt;
  const age = Date.now() - provedAt.getTime();
  /* Null, never NaN: NaN fails `age >= WINDOW` too, so it reached `new Date(NaN)` and toISOString()
     threw a RangeError that 500d identity for every app. */
  return Number.isFinite(age) ? age : null;
}

/** Unknown sessions are never fresh. */
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
