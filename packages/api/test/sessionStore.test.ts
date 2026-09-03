import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  validateSession,
} from '../src/auth/session.js';
import { hashToken } from '../src/auth/token.js';
import { consumeToken, issueToken } from '../src/auth/verification.js';
import { createDb } from '../src/db/client.js';
import { authTokens, sessions, users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const db = () => createDb(env as unknown as Env);

let n = 0;
async function seedUser(over: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({
      id,
      email: `store-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`,
      passwordHash: 'pbkdf2$1$salt$hash',
      googleId: null,
      displayName: 'Holder',
      emailVerified: true,
      ...over,
    });
  return id;
}

const rowFor = async (token: string) =>
  db()
    .select()
    .from(sessions)
    .where(eq(sessions.id, await hashToken(token)))
    .get();

describe('sessions', () => {
  /*
   * The row id is the hash, never the token. Anyone who reads the sessions table -- a backup, a
   * D1 console, a SQL injection elsewhere -- gets nothing they can present as a cookie.
   */
  it('stores only a hash, so the table holds nothing replayable', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);

    const all = await db().select().from(sessions).all();
    const stored = JSON.stringify(all);
    expect(stored).not.toContain(token);
    expect(all.map((r) => r.id)).toContain(await hashToken(token));
  });

  it('resolves its own token back to the account', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);
    expect(await validateSession(db(), token)).toMatchObject({ id: userId, hasPassword: true });
  });

  it('does not resolve a token it never issued', async () => {
    expect(await validateSession(db(), 'not-a-real-token')).toBeNull();
  });

  it('reports how the account can sign in', async () => {
    const googleOnly = await seedUser({ passwordHash: null, googleId: 'g-sub-1' });
    const { token } = await createSession(db(), googleOnly);
    expect(await validateSession(db(), token)).toMatchObject({
      hasPassword: false,
      hasGoogle: true,
    });
  });

  /* Signing in is proving who you are, so a fresh session opens inside the step-up window and a
     password change straight after login is not asked for the password it just accepted. */
  it('opens already proven, so step-up does not immediately re-ask', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);
    const row = await rowFor(token);
    expect(row?.reauthAt).toBeInstanceOf(Date);
    expect(Date.now() - (row?.reauthAt?.getTime() ?? 0)).toBeLessThan(5000);
  });

  it('expires 30 days out', async () => {
    const userId = await seedUser();
    const { expiresAt } = await createSession(db(), userId);
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  /* An expired row is not just refused, it is removed: nothing accumulates rows nobody can use. */
  it('refuses an expired session and clears the row', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, await hashToken(token)));

    expect(await validateSession(db(), token)).toBeNull();
    expect(await rowFor(token)).toBeUndefined();
  });

  it('forgets one session on sign-out and leaves the others alone', async () => {
    const userId = await seedUser();
    const phone = await createSession(db(), userId);
    const laptop = await createSession(db(), userId);

    await revokeSession(db(), phone.token);
    expect(await validateSession(db(), phone.token)).toBeNull();
    expect(await validateSession(db(), laptop.token)).not.toBeNull();
  });

  /* What a password reset relies on: every device the thief still holds has to lose access. */
  it('clears every session for one account without touching another', async () => {
    const victim = await seedUser();
    const bystander = await seedUser();
    const a = await createSession(db(), victim);
    const b = await createSession(db(), victim);
    const other = await createSession(db(), bystander);

    await revokeAllSessions(db(), victim);
    expect(await validateSession(db(), a.token)).toBeNull();
    expect(await validateSession(db(), b.token)).toBeNull();
    expect(await validateSession(db(), other.token)).not.toBeNull();
  });

  // Written on every app's auth check, so it is throttled rather than a write per request.
  it('does not rewrite last_seen_at while it is still fresh', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);
    // A minute old: inside the five-minute window, and far enough from now that a write shows up.
    // Whole seconds, because D1 stores these timestamps to the second and would drop the rest.
    const recent = new Date(Math.floor((Date.now() - 60 * 1000) / 1000) * 1000);
    await db()
      .update(sessions)
      .set({ lastSeenAt: recent })
      .where(eq(sessions.id, await hashToken(token)));

    await validateSession(db(), token);
    expect((await rowFor(token))?.lastSeenAt?.getTime()).toBe(recent.getTime());
  });

  it('does rewrite it once the throttle window has passed', async () => {
    const userId = await seedUser();
    const { token } = await createSession(db(), userId);
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await db()
      .update(sessions)
      .set({ lastSeenAt: stale })
      .where(eq(sessions.id, await hashToken(token)));

    await validateSession(db(), token);
    expect((await rowFor(token))?.lastSeenAt?.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe('one-time email tokens', () => {
  it('stores only a hash, so the table holds nothing usable', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'verify');
    const all = await db().select().from(authTokens).all();
    expect(JSON.stringify(all)).not.toContain(raw);
  });

  it('resolves to the account that was sent it', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'reset');
    expect(await consumeToken(db(), raw, 'reset')).toBe(userId);
  });

  /* A reset link lands in an inbox and stays there. Spending it once is what stops it being
     replayed later by anyone who reaches that mailbox afterwards. */
  it('spends the token, so a second use fails', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'reset');
    expect(await consumeToken(db(), raw, 'reset')).toBe(userId);
    expect(await consumeToken(db(), raw, 'reset')).toBeNull();
  });

  /*
   * Purpose is checked, not just the token. A verification link is the weaker of the two -- it is
   * handed out on sign-up -- and must never be spendable as a password reset.
   */
  it('will not spend a verification link as a password reset', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'verify');
    expect(await consumeToken(db(), raw, 'reset')).toBeNull();
  });

  it('will not spend a reset link as a verification', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'reset');
    expect(await consumeToken(db(), raw, 'verify')).toBeNull();
  });

  /* Burned even when it turns out to be expired, so a stale link cannot be retried on a clock
     skew or a race. */
  it('refuses an expired token and burns it anyway', async () => {
    const userId = await seedUser();
    const raw = await issueToken(db(), userId, 'reset');
    const id = await hashToken(raw);
    await db()
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.id, id));

    expect(await consumeToken(db(), raw, 'reset')).toBeNull();
    const left = await db()
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.id, id), eq(authTokens.purpose, 'reset')))
      .get();
    expect(left).toBeUndefined();
  });

  it('gives a reset an hour and a verification a day', async () => {
    const userId = await seedUser();
    const reset = await issueToken(db(), userId, 'reset');
    const verify = await issueToken(db(), userId, 'verify');
    const expiryOf = async (raw: string) =>
      (
        await db()
          .select()
          .from(authTokens)
          .where(eq(authTokens.id, await hashToken(raw)))
          .get()
      )?.expiresAt;

    const hours = (d: Date | undefined) => ((d?.getTime() ?? 0) - Date.now()) / 3_600_000;
    expect(hours(await expiryOf(reset))).toBeGreaterThan(0.9);
    expect(hours(await expiryOf(reset))).toBeLessThan(1.1);
    expect(hours(await expiryOf(verify))).toBeGreaterThan(23.9);
  });
});
