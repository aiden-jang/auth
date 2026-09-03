/* Getting in for the first time, and proving the address afterwards. */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession } from '../auth/session.js';
import { setSessionCookie } from '../auth/cookie.js';
import { consumeToken, issueToken } from '../auth/verification.js';
import { sendEmail } from '../email.js';
import { renderEmail } from '../emailLayout.js';
import { returnAppName } from '../returnApp.js';
import { recordSecurityEvent } from '../securityEvents.js';
import {
  deliverSignInAlert,
  link,
  MIN,
  newSignInAlert,
  overLimit,
  rateLimited,
  publicUser,
  sessionMeta,
  signedIn,
  turnstileOk,
  unauthenticated,
  type Env2,
} from '../http/context.js';

const app = new Hono<Env2>();

/*
 * A precomputed hash so a login for a missing email costs the same as a real verify
 * (no account enumeration via timing). Computed once, lazily.
 */
let dummyHash: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('timing-equalizer'));

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
  turnstileToken: z.string().optional(),
  returnTo: z.string().optional(),
});

app.post('/auth/register', async (c) => {
  if (await overLimit(c, 'register', 10, 60 * MIN)) return rateLimited(c);
  const parsed = registerBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  if (!(await turnstileOk(c, parsed.data.turnstileToken)))
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Please complete the challenge.' }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const displayName = parsed.data.displayName.trim();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (existing)
    return c.json({ error: 'EMAIL_TAKEN', message: 'That email is already registered.' }, 409);

  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, email, passwordHash: await hashPassword(parsed.data.password), displayName });
  const meta = sessionMeta(c);
  const { token, expiresAt } = await createSession(db, id, meta);
  await recordSecurityEvent(db, id, 'account_created', meta);
  setSessionCookie(c, token, expiresAt);

  const verifyToken = await issueToken(db, id, 'verify');
  await sendEmail(c.env, {
    to: email,
    subject: 'Verify your email',
    ...renderEmail({
      reason: 'sign-up',
      preheader: 'Confirm this address to finish setting up your aidenjang account.',
      heading: 'Confirm your email',
      paragraphs: [
        'Your aidenjang account is made. One tap confirms this is your address, and then it works everywhere I build.',
      ],
      action: { label: 'Confirm my email', url: link(c.env, '/verify-email', verifyToken) },
      footnote:
        'This link lasts 24 hours. If you did not create an account, ignore this and nothing happens.',
      app: returnAppName(parsed.data.returnTo),
    }),
  });

  return c.json(
    { user: { id, email, displayName, emailVerified: false, hasPassword: true, hasGoogle: false } },
    201,
  );
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().optional(),
});

app.post('/auth/login', async (c) => {
  if (await overLimit(c, 'login', 10, 5 * MIN)) return rateLimited(c);
  const parsed = loginBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  if (!(await turnstileOk(c, parsed.data.turnstileToken)))
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Please complete the challenge.' }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await verifyPassword(await getDummyHash(), parsed.data.password);
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' }, 401);
  }
  if (!user.passwordHash) {
    // Passwordless (Google) account: no password to check.
    return c.json(
      {
        error: 'USE_GOOGLE',
        message: 'This account uses Google sign-in. Use "Continue with Google".',
      },
      400,
    );
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' }, 401);
  }
  const meta = sessionMeta(c);
  const alert = await newSignInAlert(
    db,
    user.id,
    meta,
    new URL(
      '/account?security=review#active-sessions',
      c.env.APP_URL ?? new URL(c.req.url).origin,
    ).toString(),
    'password',
  );
  const { token, expiresAt } = await createSession(db, user.id, meta);
  await recordSecurityEvent(db, user.id, 'signed_in', meta, 'password');
  deliverSignInAlert(c, user.email, alert);
  setSessionCookie(c, token, expiresAt);
  return c.json({
    user: publicUser({
      ...user,
      hasPassword: user.passwordHash != null,
      hasGoogle: user.googleId != null,
    }),
  });
});

app.post('/auth/verify-email', async (c) => {
  const parsed = z
    .object({ token: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  const db = createDb(c.env);
  const userId = await consumeToken(db, parsed.data.token, 'verify');
  if (!userId)
    return c.json(
      { error: 'INVALID_TOKEN', message: 'That verification link is invalid or expired.' },
      400,
    );
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await recordSecurityEvent(db, userId, 'email_verified', sessionMeta(c));
  return c.json({ ok: true });
});

app.post('/auth/resend-verification', async (c) => {
  if (await overLimit(c, 'resend-verify', 5, 60 * MIN)) return rateLimited(c);
  const db = createDb(c.env);
  const user = await signedIn(c, db);
  if (!user) return unauthenticated(c);
  if (user.emailVerified) return c.json({ ok: true, alreadyVerified: true });
  const token = await issueToken(db, user.id, 'verify');
  await sendEmail(c.env, {
    to: user.email,
    subject: 'Verify your email',
    ...renderEmail({
      reason: 'sign-up',
      preheader: 'Confirm this address for your aidenjang account.',
      heading: 'Confirm your email',
      paragraphs: ['Here is a fresh link. The previous one no longer works.'],
      action: { label: 'Confirm my email', url: link(c.env, '/verify-email', token) },
      footnote: 'This link lasts 24 hours.',
    }),
  });
  return c.json({ ok: true });
});

// Update the signed-in user's profile. Only the display name is editable
// today (email/password have their own dedicated flows), but the endpoint
// is shaped as a general profile update so more fields can be added here.

export default app;
