import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from './env.js';
import { createDb } from './db/client.js';
import { users } from './db/schema.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import { createSession, revokeAllSessions, revokeSession, validateSession } from './auth/session.js';
import { clearSessionCookie, getCookie, SESSION_COOKIE, setSessionCookie } from './auth/cookie.js';
import { consumeToken, issueToken } from './auth/verification.js';
import { sendEmail } from './email.js';

const app = new Hono<{ Bindings: Env }>();

// Apps call auth cross-origin with credentials. In dev (no CORS_ORIGINS) reflect the origin;
// in prod only the configured app origins are allowed.
app.use('/auth/*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = c.env.CORS_ORIGINS?.split(',').map((o) => o.trim());
      if (!allowed || allowed.length === 0) return origin;
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
  })(c, next),
);

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

const link = (env: Env, path: string, token: string): string =>
  `${env.APP_URL ?? ''}${path}?token=${token}`;

const publicUser = (u: {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}) => ({ id: u.id, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified });

// A precomputed hash so a login for a missing email costs the same as a real verify
// (no account enumeration via timing). Computed once, lazily.
let dummyHash: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('timing-equalizer'));

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
});

app.post('/auth/register', async (c) => {
  const parsed = registerBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const displayName = parsed.data.displayName.trim();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'EMAIL_TAKEN', message: 'That email is already registered.' }, 409);

  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email, passwordHash: await hashPassword(parsed.data.password), displayName });
  const { token, expiresAt } = await createSession(db, id);
  setSessionCookie(c, token, expiresAt);

  const verifyToken = await issueToken(db, id, 'verify');
  await sendEmail(c.env, {
    to: email,
    subject: 'Verify your email',
    html: `<p>Welcome to owewell. Confirm your email: <a href="${link(c.env, '/verify-email', verifyToken)}">verify email</a></p>`,
  });

  return c.json({ user: { id, email, displayName, emailVerified: false } }, 201);
});

app.post('/auth/login', async (c) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await verifyPassword(await getDummyHash(), parsed.data.password);
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' }, 401);
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' }, 401);
  }
  const { token, expiresAt } = await createSession(db, user.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({ user: publicUser(user) });
});

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(createDb(c.env), token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/auth/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const user = await validateSession(createDb(c.env), token);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  return c.json({ user: publicUser(user) });
});

// Always 200, whether or not the email exists (no account enumeration).
app.post('/auth/forgot-password', async (c) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (user) {
    const token = await issueToken(db, user.id, 'reset');
    await sendEmail(c.env, {
      to: email,
      subject: 'Reset your owewell password',
      html: `<p>Reset your password: <a href="${link(c.env, '/reset-password', token)}">choose a new password</a>. This link expires in an hour.</p>`,
    });
  }
  return c.json({ ok: true });
});

app.post('/auth/reset-password', async (c) => {
  const parsed = z
    .object({ token: z.string().min(1), newPassword: z.string().min(8).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const db = createDb(c.env);
  const userId = await consumeToken(db, parsed.data.token, 'reset');
  if (!userId) return c.json({ error: 'INVALID_TOKEN', message: 'That reset link is invalid or expired.' }, 400);
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
  await revokeAllSessions(db, userId); // force re-login everywhere after a reset
  return c.json({ ok: true });
});

app.post('/auth/verify-email', async (c) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  const db = createDb(c.env);
  const userId = await consumeToken(db, parsed.data.token, 'verify');
  if (!userId) return c.json({ error: 'INVALID_TOKEN', message: 'That verification link is invalid or expired.' }, 400);
  await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  return c.json({ ok: true });
});

app.post('/auth/resend-verification', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const user = cookie ? await validateSession(db, cookie) : null;
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (user.emailVerified) return c.json({ ok: true, alreadyVerified: true });
  const token = await issueToken(db, user.id, 'verify');
  await sendEmail(c.env, {
    to: user.email,
    subject: 'Verify your email',
    html: `<p>Confirm your email: <a href="${link(c.env, '/verify-email', token)}">verify email</a></p>`,
  });
  return c.json({ ok: true });
});

export default app;
