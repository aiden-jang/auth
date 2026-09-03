/* Who you are, what you can change about it, and taking it all away. */
import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { securityEvents, sessions, users } from '../db/schema.js';
import { verifyPassword } from '../auth/password.js';
import { validateSession } from '../auth/session.js';
import { clearSessionCookie, getCookie, SESSION_COOKIE } from '../auth/cookie.js';
import {} from '../auth/passkeys.js';
import { sudoUntil } from '../auth/stepUp.js';
import {
  MIN,
  needsStepUp,
  overLimit,
  publicUser,
  signedIn,
  type Env2,
  rateLimited,
  unauthenticated,
} from '../http/context.js';

const app = new Hono<Env2>();

app.get('/auth/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return unauthenticated(c);
  const db = createDb(c.env);
  const user = await validateSession(db, token);
  if (!user) return unauthenticated(c);
  // When the step-up window closes, so the account page can count down to it instead of springing
  // a password prompt on someone mid-action. Null once it has lapsed.
  const until = await sudoUntil(db, token);
  return c.json({ user: publicUser(user), sudoUntil: until?.toISOString() ?? null });
});

// Update the signed-in user's profile. Only the display name is editable
// today (email/password have their own dedicated flows), but the endpoint
// is shaped as a general profile update so more fields can be added here.
app.post('/auth/update-profile', async (c) => {
  const db = createDb(c.env);
  const user = await signedIn(c, db);
  if (!user) return unauthenticated(c);
  const parsed = z
    .object({ displayName: z.string().trim().min(1).max(80) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const displayName = parsed.data.displayName.trim();
  await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id));
  return c.json({ user: publicUser({ ...user, displayName }) });
});

// A portable copy of the account data this identity service keeps. Credentials, provider ids,
// session hashes, raw user agents and IP addresses are deliberately absent from both the query and
// the response shape, so an export is useful without becoming a bag of reusable secrets.
app.get('/auth/export', async (c) => {
  const db = createDb(c.env);
  const me = await signedIn(c, db);
  if (!me) return unauthenticated(c);

  const account = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      emailVerified: users.emailVerified,
      passwordHash: users.passwordHash,
      googleId: users.googleId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, me.id))
    .get();
  if (!account) return unauthenticated(c);

  const [sessionRows, eventRows] = await Promise.all([
    db
      .select({
        device: sessions.device,
        location: sessions.location,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, me.id))
      .all(),
    db
      .select({
        type: securityEvents.type,
        method: securityEvents.method,
        device: securityEvents.device,
        location: securityEvents.location,
        createdAt: securityEvents.createdAt,
      })
      .from(securityEvents)
      .where(eq(securityEvents.userId, me.id))
      .orderBy(desc(securityEvents.createdAt))
      .limit(500),
  ]);
  const now = Date.now();

  return c.json({
    exportedAt: new Date().toISOString(),
    account: {
      email: account.email,
      displayName: account.displayName,
      emailVerified: account.emailVerified,
      signInMethods: [
        account.passwordHash ? 'password' : null,
        account.googleId ? 'google' : null,
      ].filter((method): method is 'password' | 'google' => method !== null),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    },
    activeSessions: sessionRows
      .filter((session) => session.expiresAt.getTime() > now)
      .map((session) => ({
        device: session.device,
        location: session.location,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: (session.lastSeenAt ?? session.createdAt).toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      })),
    securityActivity: eventRows.map((event) => ({
      type: event.type,
      method: event.method,
      device: event.device,
      location: event.location,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});

/*
 * Sessions and tokens cascade. A password account types its password; a passwordless one types its
 * own address, which anyone holding the cookie reads off /auth/me -- confirmation, not proof -- so
 * that case also has to prove the session is fresh.
 */
app.post('/auth/delete-account', async (c) => {
  if (await overLimit(c, 'delete-account', 5, 10 * MIN)) return rateLimited(c);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return unauthenticated(c);

  const parsed = z
    .object({ password: z.string().optional(), confirm: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, me.id)).get();
  if (!row) return unauthenticated(c);
  if (row.passwordHash) {
    if (!parsed.data.password || !(await verifyPassword(row.passwordHash, parsed.data.password)))
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong password.' }, 400);
  } else {
    if ((parsed.data.confirm ?? '').trim().toLowerCase() !== row.email.toLowerCase()) {
      return c.json(
        { error: 'CONFIRM_MISMATCH', message: 'Type your email address to confirm.' },
        400,
      );
    }
    // The typed address is confirmation, not proof: anyone holding the cookie reads it off
    // /auth/me. Setting a password and unlinking Google both already ask; deleting outright
    // cannot ask for less.
    const stale = await needsStepUp(c, db, cookie!, false);
    if (stale) return stale;
  }

  await db.delete(users).where(eq(users.id, row.id)); // sessions + tokens cascade
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default app;
