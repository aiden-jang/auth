/* Unlinking Google. Its own file only because it belongs to neither side cleanly. */
import { Hono } from 'hono';
import { writeEvent } from '../events.js';
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
  rateLimited,
  sessionMeta,
  unauthenticated,
  type Env2,
} from '../http/context.js';

const app = new Hono<Env2>();

// Unlink Google from the signed-in account. Refuse if it would leave no way to sign in (a
// Google-only account must set a password first), so the user can never lock themselves out.
app.post('/auth/disconnect-google', async (c) => {
  if (await overLimit(c, 'disconnect-google', 10, 5 * MIN)) return rateLimited(c);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const sessionUser = cookie ? await validateSession(db, cookie) : null;
  if (!sessionUser) return unauthenticated(c);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return unauthenticated(c);
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
  writeEvent(c.env, 'signed_in', 'password');
  setSessionCookie(c, token, expiresAt);
  await recordSecurityEvent(db, row.id, 'google_disconnected', meta);
  deliverCredentialAlert(c, row.email, 'google_disconnected', meta);
  return c.json({ ok: true });
});

export default app;
