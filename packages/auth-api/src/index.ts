import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie, deleteCookie } from 'hono/cookie';
import { DEFAULT_CSP, harden } from './harden.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from './env.js';
import { createDb } from './db/client.js';
import { users } from './db/schema.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import { createSession, revokeAllSessions, revokeSession, validateSession } from './auth/session.js';
import { clearSessionCookie, getCookie, isSecureRequest, SESSION_COOKIE, setSessionCookie } from './auth/cookie.js';
import { googleAuthUrl, googleCallbackUrl, exchangeGoogleCode, upsertGoogleUser, safeAppRedirect } from './auth/google.js';
import { consumeToken, issueToken } from './auth/verification.js';
import { sendEmail } from './email.js';
import { verifyTurnstile } from './turnstile.js';

export { RateLimiter } from './rateLimiter.js';

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// Security response headers on every route. CSRF is left to the session cookie's SameSite=Lax
// attribute, Turnstile, and the CORS allowlist below, since auth is intentionally callable
// cross-origin by the app frontends.
//
// Turnstile loads a script + iframe and phones home to challenges.cloudflare.com, so the auth
// pages need it allowed in script-src, frame-src, and connect-src on top of the shared default.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const AUTH_CSP =
  DEFAULT_CSP.replace("script-src 'self'", `script-src 'self' ${TURNSTILE_ORIGIN}`).replace(
    "connect-src 'self' https://static.cloudflareinsights.com",
    `connect-src 'self' https://static.cloudflareinsights.com ${TURNSTILE_ORIGIN}`,
  ) + `; frame-src ${TURNSTILE_ORIGIN}`;
app.use('*', harden({ csrf: false, csp: AUTH_CSP }));

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

const clientIp = (c: Ctx): string => c.req.header('cf-connecting-ip') ?? 'local';

/** True when this IP has exceeded `limit` hits for `action` in the window. */
async function overLimit(c: Ctx, action: string, limit: number, windowMs: number): Promise<boolean> {
  const ns = c.env.RATE_LIMITER;
  const stub = ns.get(ns.idFromName(`${action}:${clientIp(c)}`));
  return !(await stub.hit(limit, windowMs));
}

/** Passes when Turnstile is unconfigured (dev); otherwise the token must verify. */
async function turnstileOk(c: Ctx, token: string | undefined): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  return verifyTurnstile(c.env.TURNSTILE_SECRET, token, clientIp(c));
}

const MIN = 60_000;
const link = (env: Env, path: string, token: string): string =>
  `${env.APP_URL ?? ''}${path}?token=${token}`;

const publicUser = (u: {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasPassword: boolean;
}) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  emailVerified: u.emailVerified,
  hasPassword: u.hasPassword,
});

// A precomputed hash so a login for a missing email costs the same as a real verify
// (no account enumeration via timing). Computed once, lazily.
let dummyHash: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('timing-equalizer'));

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
  turnstileToken: z.string().optional(),
});

app.post('/auth/register', async (c) => {
  if (await overLimit(c, 'register', 10, 60 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const parsed = registerBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  if (!(await turnstileOk(c, parsed.data.turnstileToken)))
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Please complete the challenge.' }, 400);

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
    html: `<p>Welcome to aidenjang. Confirm your email: <a href="${link(c.env, '/verify-email', verifyToken)}">verify email</a></p>`,
  });

  return c.json({ user: { id, email, displayName, emailVerified: false, hasPassword: true } }, 201);
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().optional(),
});

app.post('/auth/login', async (c) => {
  if (await overLimit(c, 'login', 10, 5 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const parsed = loginBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
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
      { error: 'USE_GOOGLE', message: 'This account uses Google sign-in. Use "Continue with Google".' },
      400,
    );
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' }, 401);
  }
  const { token, expiresAt } = await createSession(db, user.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({ user: publicUser({ ...user, hasPassword: user.passwordHash != null }) });
});

// --- Google OAuth (authorization-code flow) ---

const GOOGLE_STATE_COOKIE = 'g_oauth';

app.get('/auth/google', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GOOGLE_DISABLED', message: 'Google sign-in is not configured.' }, 404);
  }
  const state = crypto.randomUUID();
  const redirectUri = googleCallbackUrl(c.req.url);
  // Short-lived CSRF nonce + return target; SameSite=Lax so it survives the top-level redirect back.
  setCookie(c, GOOGLE_STATE_COOKIE, JSON.stringify({ s: state, r: c.req.query('return_to') ?? '' }), {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/auth/google',
    maxAge: 600,
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
  return c.redirect(googleAuthUrl(clientId, redirectUri, state));
});

app.get('/auth/google/callback', async (c) => {
  const raw = getCookie(c, GOOGLE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_STATE_COOKIE, {
    path: '/auth/google',
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
  // Land back on the UI origin (APP_URL) rather than the Worker's own origin — matters in dev,
  // where the callback runs on the Worker (:34100) but the app is served by Vite (:34110).
  const uiBase = c.env.APP_URL ?? new URL(c.req.url).origin;
  // Log the exact failure stage (visible in `wrangler tail` / the dev console) and pass a reason
  // in the URL, so a black-box "Google sign-in failed" becomes debuggable.
  const fail = (reason: string): Response => {
    console.error('[google/callback] failed:', reason);
    return c.redirect(new URL(`/login?error=google_failed&reason=${reason}`, uiBase).toString());
  };

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('not_configured');

  const providerError = c.req.query('error');
  if (providerError) return fail(`provider_${providerError}`);
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return fail('missing_params');

  let saved: { s?: string; r?: string } | null = null;
  try {
    saved = raw ? (JSON.parse(raw) as { s?: string; r?: string }) : null;
  } catch {
    saved = null;
  }
  if (!saved) return fail('no_state_cookie');
  if (saved.s !== state) return fail('state_mismatch');

  const redirectUri = googleCallbackUrl(c.req.url);
  const identity = await exchangeGoogleCode(clientId, clientSecret, code, redirectUri);
  if (!identity) return fail('token_exchange');

  try {
    const db = createDb(c.env);
    const user = await upsertGoogleUser(db, identity);
    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(c, token, expiresAt);
    return c.redirect(safeAppRedirect(saved.r ?? '', uiBase));
  } catch (err) {
    // Most commonly a missing `google_id` column (remote D1 migration not applied) — surface it
    // as a reason'd redirect instead of a raw 500 so it's debuggable in `wrangler tail`.
    console.error('[google/callback] upsert/session error:', err);
    return fail('session');
  }
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

const forgotBody = z.object({ email: z.string().email(), turnstileToken: z.string().optional() });

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
      html: `<p>Reset your password: <a href="${link(c.env, '/reset-password', token)}">choose a new password</a>. This link expires in an hour.</p>`,
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

// Update the signed-in user's profile. Only the display name is editable
// today (email/password have their own dedicated flows), but the endpoint
// is shaped as a general profile update so more fields can be added here.
app.post('/auth/update-profile', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const user = cookie ? await validateSession(db, cookie) : null;
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const parsed = z
    .object({ displayName: z.string().trim().min(1).max(80) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const displayName = parsed.data.displayName.trim();
  await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id));
  return c.json({ user: publicUser({ ...user, displayName }) });
});

// Change the password for the signed-in user. Requires the current password
// (so a hijacked-but-idle session can't silently lock the owner out), then
// rotates every session and re-establishes this device — signing the user out
// everywhere else, same as a reset.
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
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (!row.passwordHash)
    return c.json(
      { error: 'NO_PASSWORD', message: 'This account signs in with Google; there is no password to change.' },
      400,
    );
  if (!(await verifyPassword(row.passwordHash, parsed.data.currentPassword)))
    return c.json({ error: 'INVALID_CREDENTIALS', message: 'Your current password is wrong.' }, 400);

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, row.id));
  await revokeAllSessions(db, row.id); // sign out everywhere...
  const { token, expiresAt } = await createSession(db, row.id); // ...then keep this device
  setSessionCookie(c, token, expiresAt);
  return c.json({ ok: true });
});

// Add a password to a passwordless (Google-only) account, so the user can also sign in with email.
// Unlike change-password there's no current password to verify — the live session is the proof of
// ownership — but we hard-refuse if a password already exists so this can't bypass that check.
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
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (row.passwordHash)
    return c.json(
      { error: 'PASSWORD_EXISTS', message: 'This account already has a password. Use change password instead.' },
      400,
    );

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
    .where(eq(users.id, row.id));
  return c.json({ ok: true });
});

// Everything that isn't an API route: serve the login/account UI (SPA fallback via assets).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
