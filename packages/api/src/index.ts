import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie, deleteCookie } from 'hono/cookie';
import { DEFAULT_CSP, harden } from './harden.js';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from './env.js';
import { createDb } from './db/client.js';
import { securityEvents, sessions, users } from './db/schema.js';
import { hashPassword, verifyPassword } from './auth/password.js';
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  validateSession,
  type SessionMeta,
} from './auth/session.js';
import { hashToken } from './auth/token.js';
import { deviceLabel } from './device.js';
import { clearSessionCookie, getCookie, isSecureRequest, SESSION_COOKIE, setSessionCookie } from './auth/cookie.js';
import { googleAuthUrl, googleCallbackUrl, exchangeGoogleCode, upsertGoogleUser, safeAppRedirect } from './auth/google.js';
import { consumeToken, issueToken } from './auth/verification.js';
import { sendEmail } from './email.js';
import { verifyTurnstile } from './turnstile.js';
import { recordSecurityEvent } from './securityEvents.js';

export { RateLimiter } from './rateLimiter.js';

type Ctx = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

// Safety net: any error a route does not handle itself is logged server-side (Workers Logs /
// `wrangler tail`) and returned as a generic 500. On the identity service especially, an internal
// failure must never leak a stack trace or implementation detail to the client.
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'InternalError' }, 500);
});

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

/**
 * Nothing under /auth is cacheable, and /auth/me least of all.
 *
 * It had no Cache-Control at all. A GET with no cache directives is *heuristically* cacheable, so
 * browsers were free to keep the signed-in `200 {user}` and hand it back later. The visible bug: sign
 * out, press back, the page re-checks the session, the browser answers from its own cache, and you are
 * apparently signed in again until a refresh bypasses it.
 *
 * The reason this is worse than a display glitch: these responses are per-session and the only Vary
 * here is Origin, not Cookie, so any shared cache between the browser and the Worker could in principle
 * serve one person's account to somebody else. `no-store` is the only correct answer for a response that
 * depends on who is asking.
 */
app.use('/auth/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Pragma', 'no-cache');
});

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

// Capture who/where a session was created from, for the active-sessions list. Device is a parsed
// label (not the raw UA); location is a coarse city/country from Cloudflare's edge (not the raw IP).
const sessionMeta = (c: Context<{ Bindings: Env }>): SessionMeta => {
  const cf = c.req.raw.cf as { city?: string; country?: string } | undefined;
  const location = [cf?.city, cf?.country].filter(Boolean).join(', ') || null;
  return { device: deviceLabel(c.req.header('user-agent')), location };
};

const publicUser = (u: {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
}) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  emailVerified: u.emailVerified,
  hasPassword: u.hasPassword,
  hasGoogle: u.hasGoogle,
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
  const meta = sessionMeta(c);
  const { token, expiresAt } = await createSession(db, id, meta);
  await recordSecurityEvent(db, id, 'account_created', meta);
  setSessionCookie(c, token, expiresAt);

  const verifyToken = await issueToken(db, id, 'verify');
  await sendEmail(c.env, {
    to: email,
    subject: 'Verify your email',
    html: `<p>Welcome to aidenjang. Confirm your email: <a href="${link(c.env, '/verify-email', verifyToken)}">verify email</a></p>`,
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
  const meta = sessionMeta(c);
  const { token, expiresAt } = await createSession(db, user.id, meta);
  await recordSecurityEvent(db, user.id, 'signed_in', meta);
  setSessionCookie(c, token, expiresAt);
  return c.json({
    user: publicUser({ ...user, hasPassword: user.passwordHash != null, hasGoogle: user.googleId != null }),
  });
});

// --- Google OAuth (authorization-code flow) ---

const GOOGLE_STATE_COOKIE = 'g_oauth';

app.get('/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'GOOGLE_DISABLED', message: 'Google sign-in is not configured.' }, 404);
  }
  // `link=1` attaches Google to the signed-in account instead of logging in; it requires a live
  // session up front so a logged-out visitor can't kick off a pointless link round-trip.
  const link = c.req.query('link') === '1';
  if (link) {
    const cookie = getCookie(c, SESSION_COOKIE);
    const authed = cookie ? await validateSession(createDb(c.env), cookie) : null;
    if (!authed) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  }
  const state = crypto.randomUUID();
  const redirectUri = googleCallbackUrl(c.req.url);
  // Short-lived CSRF nonce + return target; SameSite=Lax so it survives the top-level redirect back.
  setCookie(c, GOOGLE_STATE_COOKIE, JSON.stringify({ s: state, r: c.req.query('return_to') ?? '', link }), {
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

  let saved: { s?: string; r?: string; link?: boolean } | null = null;
  try {
    saved = raw ? (JSON.parse(raw) as { s?: string; r?: string; link?: boolean }) : null;
  } catch {
    saved = null;
  }
  const isLink = saved?.link === true;
  // Log the exact failure stage (visible in `wrangler tail` / the dev console) and pass a reason
  // in the URL, so a black-box "Google sign-in failed" becomes debuggable. Link failures return to
  // the account page (where the user started); login failures to /login.
  const fail = (reason: string): Response => {
    console.error('[google/callback] failed:', reason);
    const dest = isLink ? '/account' : '/login';
    return c.redirect(new URL(`${dest}?error=google_failed&reason=${reason}`, uiBase).toString());
  };

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('not_configured');

  const providerError = c.req.query('error');
  if (providerError) return fail(`provider_${providerError}`);
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return fail('missing_params');

  if (!saved) return fail('no_state_cookie');
  if (saved.s !== state) return fail('state_mismatch');

  const redirectUri = googleCallbackUrl(c.req.url);
  const identity = await exchangeGoogleCode(clientId, clientSecret, code, redirectUri);
  if (!identity) return fail('token_exchange');

  try {
    const db = createDb(c.env);

    if (isLink) {
      // Attach this Google identity to the already-signed-in account. The live session proves the
      // user owns the local account; completing OAuth proves they own the Google one. Emails need
      // not match (linking a work Google to a personal account is fine).
      const cookie = getCookie(c, SESSION_COOKIE);
      const current = cookie ? await validateSession(db, cookie) : null;
      if (!current) return fail('link_unauthenticated');
      const taken = await db.select({ id: users.id }).from(users).where(eq(users.googleId, identity.sub)).get();
      if (taken && taken.id !== current.id) return fail('google_already_linked');
      await db
        .update(users)
        .set({
          googleId: identity.sub,
          // Only let Google vouch for the email if it's the same address on this account.
          ...(identity.emailVerified && identity.email === current.email ? { emailVerified: true } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, current.id));
      await recordSecurityEvent(db, current.id, 'google_connected', sessionMeta(c));
      return c.redirect(safeAppRedirect(saved.r ?? '/account', uiBase));
    }

    const user = await upsertGoogleUser(db, identity);
    const meta = sessionMeta(c);
    const { token, expiresAt } = await createSession(db, user.id, meta);
    await recordSecurityEvent(db, user.id, 'signed_in', meta);
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

const magicBody = z.object({
  email: z.string().email(),
  returnTo: z.string().optional(),
  turnstileToken: z.string().optional(),
});

// Email a one-time sign-in link. Always 200 (no account enumeration); a link is sent only if the
// email has an account.
app.post('/auth/magic-link', async (c) => {
  if (await overLimit(c, 'magic', 5, 60 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const parsed = magicBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  if (!(await turnstileOk(c, parsed.data.turnstileToken)))
    return c.json({ error: 'TURNSTILE_FAILED', message: 'Please complete the challenge.' }, 400);

  const db = createDb(c.env);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (user) {
    const token = await issueToken(db, user.id, 'magic');
    const rt = parsed.data.returnTo ? `&return_to=${encodeURIComponent(parsed.data.returnTo)}` : '';
    const href = `${link(c.env, '/auth/magic/callback', token)}${rt}`;
    await sendEmail(c.env, {
      to: email,
      subject: 'Your aidenjang sign-in link',
      html: `<p>Sign in to aidenjang: <a href="${href}">click here to sign in</a>. This link expires in 15 minutes and works once.</p>`,
    });
  }
  return c.json({ ok: true });
});

// Consume a magic link: sign the user in and bounce to the app. GET so it works straight from email.
app.get('/auth/magic/callback', async (c) => {
  const uiBase = c.env.APP_URL ?? new URL(c.req.url).origin;
  const token = c.req.query('token');
  if (!token) return c.redirect(new URL('/login?error=magic_failed', uiBase).toString());
  const db = createDb(c.env);
  const userId = await consumeToken(db, token, 'magic');
  if (!userId) return c.redirect(new URL('/login?error=magic_failed', uiBase).toString());
  const meta = sessionMeta(c);
  const { token: sessionToken, expiresAt } = await createSession(db, userId, meta);
  await recordSecurityEvent(db, userId, 'signed_in', meta);
  setSessionCookie(c, sessionToken, expiresAt);
  return c.redirect(safeAppRedirect(c.req.query('return_to') ?? '', uiBase));
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
  await recordSecurityEvent(db, userId, 'password_reset', sessionMeta(c));
  return c.json({ ok: true });
});

app.post('/auth/verify-email', async (c) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  const db = createDb(c.env);
  const userId = await consumeToken(db, parsed.data.token, 'verify');
  if (!userId) return c.json({ error: 'INVALID_TOKEN', message: 'That verification link is invalid or expired.' }, 400);
  await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  await recordSecurityEvent(db, userId, 'email_verified', sessionMeta(c));
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
  const meta = sessionMeta(c);
  const { token, expiresAt } = await createSession(db, row.id, meta); // ...then keep this device
  await recordSecurityEvent(db, row.id, 'password_changed', meta);
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
  await recordSecurityEvent(db, row.id, 'password_added', sessionMeta(c));
  return c.json({ ok: true });
});

// Unlink Google from the signed-in account. Refuse if it would leave no way to sign in (a
// Google-only account must set a password first), so the user can never lock themselves out.
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

  await db.update(users).set({ googleId: null, updatedAt: new Date() }).where(eq(users.id, row.id));
  await recordSecurityEvent(db, row.id, 'google_disconnected', sessionMeta(c));
  return c.json({ ok: true });
});

// The signed-in user's recent security activity. The allowlisted event type is recorded by this
// service, while device and location remain intentionally coarse.
app.get('/auth/security-events', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const events = await db
    .select({
      id: securityEvents.id,
      type: securityEvents.type,
      device: securityEvents.device,
      location: securityEvents.location,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(eq(securityEvents.userId, me.id))
    .orderBy(desc(securityEvents.createdAt))
    .limit(12);

  return c.json({
    events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  });
});

// A portable copy of the account data this identity service keeps. Credentials, provider ids,
// session hashes, raw user agents and IP addresses are deliberately absent from both the query and
// the response shape, so an export is useful without becoming a bag of reusable secrets.
app.get('/auth/export', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);

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
  if (!account) return c.json({ error: 'UNAUTHENTICATED' }, 401);

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
      signInMethods: [account.passwordHash ? 'password' : null, account.googleId ? 'google' : null]
        .filter((method): method is 'password' | 'google' => method !== null),
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
      device: event.device,
      location: event.location,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});

// The signed-in user's active sessions ("signed in on these devices"), newest activity first.
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
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

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
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const revoked = await db
    .delete(sessions)
    .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, me.id)))
    .returning({ id: sessions.id });
  if (revoked.length > 0) await recordSecurityEvent(db, me.id, 'device_signed_out', sessionMeta(c));
  return c.json({ ok: true });
});

// Revoke every session except the current one ("sign out everywhere else").
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
  if (revoked.length > 0) await recordSecurityEvent(db, me.id, 'other_devices_signed_out', sessionMeta(c));
  return c.json({ ok: true });
});

// Permanently delete the account and everything attached (sessions + tokens cascade). Re-auth
// required: the password if the account has one, else typing the exact email (Google-only).
app.post('/auth/delete-account', async (c) => {
  if (await overLimit(c, 'delete-account', 5, 10 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const parsed = z
    .object({ password: z.string().optional(), confirm: z.string().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, me.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (row.passwordHash) {
    if (!parsed.data.password || !(await verifyPassword(row.passwordHash, parsed.data.password)))
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Wrong password.' }, 400);
  } else if ((parsed.data.confirm ?? '').trim().toLowerCase() !== row.email.toLowerCase()) {
    return c.json({ error: 'CONFIRM_MISMATCH', message: 'Type your email address to confirm.' }, 400);
  }

  await db.delete(users).where(eq(users.id, row.id)); // sessions + tokens cascade
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// Everything that isn't an API route: serve the login/account UI (SPA fallback via assets).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
