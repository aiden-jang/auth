import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { authTokens } from '../db/schema.js';
import { generateToken, hashToken } from './token.js';

export type TokenPurpose = 'reset' | 'verify';

const TTL_MS: Record<TokenPurpose, number> = {
  reset: 60 * 60 * 1000, // 1 hour
  verify: 24 * 60 * 60 * 1000, // 24 hours
};

/** Issue a one-time token, store its hash, return the raw token for the email link. */
export async function issueToken(db: DB, userId: string, purpose: TokenPurpose): Promise<string> {
  const raw = generateToken();
  await db.insert(authTokens).values({
    id: await hashToken(raw),
    userId,
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return raw;
}

/** Consume a token: delete it (one-time use) and return its userId if valid and unexpired. */
export async function consumeToken(
  db: DB,
  raw: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const id = await hashToken(raw);
  const row = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.id, id), eq(authTokens.purpose, purpose)))
    .get();
  if (!row) return null;
  await db.delete(authTokens).where(eq(authTokens.id, id));
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}
