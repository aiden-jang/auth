/* Everything that turns on knowing a password: forgetting it, resetting it, proving it. */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, revokeAllSessions, validateSession } from '../auth/session.js';
import { getCookie, SESSION_COOKIE, setSessionCookie } from '../auth/cookie.js';
import { consumeToken, issueToken } from '../auth/verification.js';
import { stampReauth, sudoUntil } from '../auth/stepUp.js';
import { sendEmail } from '../email.js';
import { renderEmail } from '../emailLayout.js';
import { returnAppName } from '../returnApp.js';
import { recordSecurityEvent } from '../securityEvents.js';
import {
  deliverCredentialAlert,
  link,
  MIN,
  needsStepUp,
  overLimit,
  sessionMeta,
  turnstileOk,
  type Env2,
} from '../http/context.js';

const app = new Hono<Env2>();

const forgotBody = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional(),
  returnTo: z.string().optional(),
});

// Always 200, whether or not the email exists (no account enumeration).

app.post('/auth/forgot-password', async (c) => {
  if (await overLimit(c, 'forgot', 5, 60 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const parsed = forgotBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  if (!(await turnstileOk(c, parsed.data.turnstileToken)))
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Please complete the challenge.' }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (user) {
    const token = await issueToken(db, user.id, 'reset');
    await sendEmail(c.env, {
      to: email,
      subject: 'Reset your aidenjang password',
      ...renderEmail({
        reason: 'password-reset',
        preheader: 'Choose a new password for your aidenjang account.',
        heading: 'Reset your password',
        paragraphs: [
          'Somebody asked to reset the password on your aidenjang account.',
          'If that was not you, you can ignore this. Your password does not change until somebody opens this link and sets a new one.',
        ],
        action: { label: 'Choose a new password', url: link(c.env, '/reset-password', token) },
        // Named as a thing not to forward, because a reset link is a password until it is used.
        footnote:
          'This link lasts one hour and works once. Anybody who has it can set your password, so do not forward it.',
        app: returnAppName(parsed.data.returnTo),
      }),
    });
  }
  return c.json({ ok: true });
});

app.post('/auth/reset-password', async (c) => {
  if (await overLimit(c, 'reset', 10, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const parsed = z
    .object({ token: z.string().min(1), newPassword: z.string().min(8).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const db = createDb(c.env);
  const userId = await consumeToken(db, parsed.data.token, 'reset');
  if (!userId)
    return c.json(
      { error: 'INVALID_TOKEN', message: 'That reset link is invalid or expired.' },
      400,
    );
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await revokeAllSessions(db, userId); // force re-login everywhere after a reset
  await recordSecurityEvent(db, userId, 'password_reset', sessionMeta(c));
  return c.json({ ok: true });
});

app.post('/auth/reauth', async (c) => {
  if (await overLimit(c, 'reauth', 5, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me || !cookie) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const parsed = z
    .object({ password: z.string().min(1).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, me.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (!row.passwordHash)
    return c.json(
      { error: 'NO_PASSWORD', message: 'This account has no password to confirm with.' },
      400,
    );
  if (!(await verifyPassword(row.passwordHash, parsed.data.password)))
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'That password is not right.' }, 400);

  await stampReauth(db, cookie);
  return c.json({ ok: true, sudoUntil: (await sudoUntil(db, cookie))?.toISOString() ?? null });
});

app.post('/auth/change-password', async (c) => {
  if (await overLimit(c, 'change-password', 10, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const sessionUser = cookie ? await validateSession(db, cookie) : null;
  if (!sessionUser) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (!row.passwordHash)
    return c.json(
      {
        error: 'NO_PASSWORD',
        message: 'This account signs in with Google; there is no password to change.',
      },
      400,
    );
  if (!(await verifyPassword(row.passwordHash, parsed.data.currentPassword)))
    return c.json(
      { error: 'INVALID_CREDENTIALS', message: 'Your current password is wrong.' },
      400,
    );

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, row.id));
  await revokeAllSessions(db, row.id); // sign out everywhere...
  const meta = sessionMeta(c);
  const { token, expiresAt } = await createSession(db, row.id, meta); // ...then keep this device
  await recordSecurityEvent(db, row.id, 'password_changed', meta);
  setSessionCookie(c, token, expiresAt);
  deliverCredentialAlert(c, row.email, 'password_changed', meta);
  return c.json({ ok: true });
});

/*
 * Add a password to a passwordless (Google-only) account, so it can also sign in with email.
 *
 * There is no current password to verify here, which is exactly what made this the soft spot: a
 * live cookie used to be the whole proof. Paired with disconnect-google that was a lockout chain
 * (give the account a password the thief knows, then cut the Google link the owner uses), so this
 * now needs a session that proved itself recently, revokes every other session, and mails the owner.
 * See auth/stepUp.ts.
 */
app.post('/auth/set-password', async (c) => {
  if (await overLimit(c, 'set-password', 10, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const sessionUser = cookie ? await validateSession(db, cookie) : null;
  if (!sessionUser) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const parsed = z
    .object({ newPassword: z.string().min(8).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (row.passwordHash)
    return c.json(
      {
        error: 'PASSWORD_EXISTS',
        message: 'This account already has a password. Use change password instead.',
      },
      400,
    );
  const stale = await needsStepUp(c, db, cookie!, false);
  if (stale) return stale;

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, row.id));
  const meta = sessionMeta(c);
  // Same hygiene as change-password: anything else holding a cookie for this account loses it, and
  // this device is handed a new one so the person doing the change is not signed out by their own
  // action.
  await revokeAllSessions(db, row.id);
  const { token, expiresAt } = await createSession(db, row.id, meta);
  setSessionCookie(c, token, expiresAt);
  await recordSecurityEvent(db, row.id, 'password_added', meta);
  deliverCredentialAlert(c, row.email, 'password_added', meta);
  return c.json({ ok: true });
});

// Unlink Google from the signed-in account. Refuse if it would leave no way to sign in (a
// Google-only account must set a password first), so the user can never lock themselves out.

export default app;
