/* Unlinking Google. Its own file only because it belongs to neither side cleanly. */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { createSession, revokeAllSessions, validateSession } from '../auth/session.js';
import { getCookie, SESSION_COOKIE, setSessionCookie } from '../auth/cookie.js';
import { recordSecurityEvent } from '../securityEvents.js';
import {
  deliverCredentialAlert,
  MIN,
  needsStepUp,
  overLimit,
  sessionMeta,
  type Env2,
} from '../http/context.js';

const app = new Hono<Env2>();

app.post('/auth/disconnect-google', async (c) => {
  if (await overLimit(c, 'disconnect-google', 10, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const sessionUser = cookie ? await validateSession(db, cookie) : null;
  if (!sessionUser) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (!row.googleId) return c.json({ ok: true }); // already unlinked
  if (!row.passwordHash)
    return c.json(
      { error: 'CANNOT_UNLINK', message: 'Set a password first so you are not locked out.' },
      400,
    );
  const stale = await needsStepUp(c, db, cookie!, true);
  if (stale) return stale;

  await db.update(users).set({ googleId: null, updatedAt: new Date() }).where(eq(users.id, row.id));
  const meta = sessionMeta(c);
  await revokeAllSessions(db, row.id);
  const { token, expiresAt } = await createSession(db, row.id, meta);
  setSessionCookie(c, token, expiresAt);
  await recordSecurityEvent(db, row.id, 'google_disconnected', meta);
  deliverCredentialAlert(c, row.email, 'google_disconnected', meta);
  return c.json({ ok: true });
});

// The signed-in user's recent security activity. The allowlisted event type is recorded by this
// service, while device and location remain intentionally coarse.

// A portable copy of the account data this identity service keeps. Credentials, provider ids,
// session hashes, raw user agents and IP addresses are deliberately absent from both the query and
// the response shape, so an export is useful without becoming a bag of reusable secrets.

export default app;
