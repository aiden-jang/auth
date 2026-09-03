import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/auth/session.js';
import {
  isFresh,
  reauthAgeMs,
  stampReauth,
  SUDO_WINDOW_MS,
  sudoUntil,
} from '../src/auth/stepUp.js';
import { hashToken } from '../src/auth/token.js';
import { createDb } from '../src/db/client.js';
import { sessions, users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const db = () => createDb(env as unknown as Env);

let n = 0;
async function seedSession(): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({
      id,
      email: `step-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`,
      passwordHash: 'pbkdf2$1$salt$hash',
      googleId: null,
      displayName: 'Holder',
      emailVerified: true,
    });
  return (await createSession(db(), id)).token;
}

/** Move this session's last proof into the past. */
async function proveAt(token: string, msAgo: number): Promise<void> {
  await db()
    .update(sessions)
    .set({ reauthAt: new Date(Date.now() - msAgo) })
    .where(eq(sessions.id, await hashToken(token)));
}

/*
 * Step-up guards the actions that change how you sign in. The chain it closes: from a stolen
 * cookie alone, set a password on a Google-only account (which has none to ask for), then unlink
 * the owner's Google. Freshness is what a stolen cookie cannot supply on its own.
 */
describe('proving a session again before a sensitive action', () => {
  /* Ten minutes. Every other test here measures against the constant, so only this one would
     notice it being widened -- and a step-up window is a security parameter, not a preference. */
  it('is ten minutes wide', () => {
    expect(SUDO_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('counts a session that just signed in as fresh', async () => {
    expect(await isFresh(db(), await seedSession())).toBe(true);
  });

  it('goes stale once the window has passed', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS + 60_000);
    expect(await isFresh(db(), token)).toBe(false);
  });

  it('holds right up to the edge of the window', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS - 30_000);
    expect(await isFresh(db(), token)).toBe(true);
  });

  /* Since you last proved who you are, not since you last clicked: a window that activity extends
     would never close for anyone still using the app, which is exactly the stolen-cookie case. */
  it('is not extended by ordinary use', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS - 30_000);
    const before = await reauthAgeMs(db(), token);
    await isFresh(db(), token);
    expect((await reauthAgeMs(db(), token)) ?? 0).toBeGreaterThanOrEqual(before ?? 0);
  });

  it('becomes fresh again once the password is re-entered', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS + 60_000);
    expect(await isFresh(db(), token)).toBe(false);

    await stampReauth(db(), token);
    expect(await isFresh(db(), token)).toBe(true);
  });

  it('never vouches for a session it has no row for', async () => {
    expect(await reauthAgeMs(db(), 'not-a-session')).toBeNull();
    expect(await isFresh(db(), 'not-a-session')).toBe(false);
    expect(await sudoUntil(db(), 'not-a-session')).toBeNull();
  });

  /*
   * Sessions predating the reauth_at column fall back to created_at: creating one did involve
   * authenticating, at that moment. Treating them as never-proven would have asked every existing
   * user for a password on their first sensitive action after the deploy.
   */
  it('falls back to when a pre-column session was created', async () => {
    const token = await seedSession();
    await db()
      .update(sessions)
      .set({ reauthAt: null })
      .where(eq(sessions.id, await hashToken(token)));
    expect(await isFresh(db(), token)).toBe(true);
  });

  it('lets an old pre-column session go stale like any other', async () => {
    const token = await seedSession();
    await db()
      .update(sessions)
      .set({ reauthAt: null, createdAt: new Date(Date.now() - SUDO_WINDOW_MS - 60_000) })
      .where(eq(sessions.id, await hashToken(token)));
    expect(await isFresh(db(), token)).toBe(false);
  });
});

/* The account page counts down against this, so it has to be the remaining time, not the window. */
describe('how long the window has left', () => {
  it('reports the time remaining, not the whole window', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS / 2);
    const until = await sudoUntil(db(), token);
    const leftMs = (until?.getTime() ?? 0) - Date.now();
    expect(leftMs).toBeGreaterThan(SUDO_WINDOW_MS / 2 - 30_000);
    expect(leftMs).toBeLessThanOrEqual(SUDO_WINDOW_MS / 2 + 1000);
  });

  it('reports nothing once the window has closed', async () => {
    const token = await seedSession();
    await proveAt(token, SUDO_WINDOW_MS + 1000);
    expect(await sudoUntil(db(), token)).toBeNull();
  });

  /*
   * A timestamp that does not survive the round trip makes `age` NaN, which fails every comparison
   * and sailed past the bail-out into `new Date(NaN)`. /auth/me then called toISOString() on it and
   * threw a RangeError, 500ing identity for every app on the platform.
   */
  it('returns null rather than an invalid date when the timestamp is unusable', async () => {
    const token = await seedSession();
    // Written past drizzle, because the incident was a column the ORM could not read back as a
    // date. Setting `new Date(NaN)` through drizzle stores a null and takes the createdAt
    // fallback instead, which is the healthy path, not this one.
    await (env as unknown as Env).DB.prepare(
      "UPDATE sessions SET reauth_at = 'not-a-timestamp' WHERE id = ?",
    )
      .bind(await hashToken(token))
      .run();

    expect(await reauthAgeMs(db(), token)).not.toBeNaN();
    const until = await sudoUntil(db(), token);
    expect(until === null || !Number.isNaN(until.getTime())).toBe(true);
    expect(await isFresh(db(), token)).toBe(false);
  });
});
