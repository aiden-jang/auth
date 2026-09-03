/* The devices signed in right now, and signing them out. */
import { Hono } from 'hono';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { revokeSession, validateSession } from '../auth/session.js';
import { hashToken } from '../auth/token.js';
import { clearSessionCookie, getCookie, SESSION_COOKIE } from '../auth/cookie.js';
import { recordSecurityEvent } from '../securityEvents.js';
import { sessionMeta, type Env2 } from '../http/context.js';

const app = new Hono<Env2>();

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(createDb(c.env), token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/auth/sessions', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const currentId = cookie ? await hashToken(cookie) : '';

  const now = Date.now();
  const rows = await db
    .select({
      id: sessions.id,
      device: sessions.device,
      location: sessions.location,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, me.id))
    .all();

  const list = rows
    .filter((r) => r.expiresAt.getTime() > now)
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      device: r.device,
      location: r.location,
      lastSeenAt: (r.lastSeenAt ?? r.createdAt).toISOString(),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }))
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1; // this device first
      return b.lastSeenAt.localeCompare(a.lastSeenAt); // then most-recently-active
    });
  return c.json({ sessions: list });
});

// Give a session a memorable, user-controlled label without exposing or changing its token.
app.post('/auth/sessions/rename', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const parsed = z
    .object({ id: z.string().min(1), label: z.string().trim().min(1).max(40) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const renamed = await db
    .update(sessions)
    .set({ device: parsed.data.label })
    .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, me.id)))
    .returning({ id: sessions.id, device: sessions.device });
  if (renamed.length === 0) {
    return c.json({ error: 'NOT_FOUND', message: 'That session no longer exists.' }, 404);
  }

  await recordSecurityEvent(db, me.id, 'device_renamed', sessionMeta(c));
  return c.json({ session: renamed[0] });
});

// Revoke one session (scoped to the caller's own sessions) — signs that device out.
app.post('/auth/sessions/revoke', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const parsed = z
    .object({ id: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const revoked = await db
    .delete(sessions)
    .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, me.id)))
    .returning({ id: sessions.id });
  if (revoked.length > 0) await recordSecurityEvent(db, me.id, 'device_signed_out', sessionMeta(c));
  return c.json({ ok: true });
});

// Revoke every session except the current one ("sign out everywhere else").
/*
 * Sign out everything except this device.
 *
 * Deliberately NOT behind step-up. This is the button someone reaches for when they think another
 * device is not theirs, so putting a password prompt in front of it would slow down exactly the
 * person we want moving fast. Step-up guards changing how you sign in, not defending yourself.
 */
app.post('/auth/sessions/revoke-others', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const currentId = cookie ? await hashToken(cookie) : '';
  const revoked = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, me.id), ne(sessions.id, currentId)))
    .returning({ id: sessions.id });
  if (revoked.length > 0)
    await recordSecurityEvent(db, me.id, 'other_devices_signed_out', sessionMeta(c));
  return c.json({ ok: true });
});

// Permanently delete the account and everything attached (sessions + tokens cascade). Re-auth
// required: the password if the account has one, else typing the exact email (Google-only).
/*
 * Also not behind step-up, because it already carries its own proof: a password account has to type
 * the password, and a Google-only account has to type its own email address. Adding the freshness
 * gate on top would make an account with no password permanently undeletable, since there would be
 * nothing it could ever re-authenticate with. A wall you cannot climb is not security, it is a bug
 * with a good excuse.
 */

export default app;
