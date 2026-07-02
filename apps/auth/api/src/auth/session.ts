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
}

/** Create a session, return the raw token (store the hash) and its expiry. */
export async function createSession(
  db: DB,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
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
      expiresAt: sessions.expiresAt,
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
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerified,
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
