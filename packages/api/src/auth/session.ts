import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { generateToken, hashToken } from './token.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  /** Whether the account has a password set. False for Google-only accounts, which can add one. */
  hasPassword: boolean;
  /** Whether a Google account is linked. */
  hasGoogle: boolean;
}

export interface SessionMeta {
  device?: string | null;
  location?: string | null;
}

/** How often validateSession refreshes last_seen_at, so it isn't a DB write on every request. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/** Create a session, return the raw token (store the hash) and its expiry. */
export async function createSession(
  db: DB,
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const id = await hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    device: meta.device ?? null,
    location: meta.location ?? null,
    lastSeenAt: now,
  });
  return { token, expiresAt };
}

/** Resolve a raw token to its user, or null if missing/expired (expired rows are pruned). */
export async function validateSession(db: DB, token: string): Promise<SessionUser | null> {
  const id = await hashToken(token);
  const row = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerified: users.emailVerified,
      passwordHash: users.passwordHash,
      googleId: users.googleId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Keep last_seen_at fresh for the active-sessions list, but throttled so it isn't a write per
  // request (validateSession runs on every app's auth check).
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerified,
    hasPassword: row.passwordHash != null,
    hasGoogle: row.googleId != null,
  };
}

export async function revokeSession(db: DB, token: string): Promise<void> {
  const id = await hashToken(token);
  await db.delete(sessions).where(eq(sessions.id, id));
}

/** Kill every session for a user (e.g. after a password reset). */
export async function revokeAllSessions(db: DB, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
