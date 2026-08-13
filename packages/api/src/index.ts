import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie, deleteCookie } from 'hono/cookie';
import { DEFAULT_CSP, harden } from './harden.js';
import { onUnhandledError, requestIdFrom } from './requestId.js';
import { renderEmail, type RenderedEmail } from './emailLayout.js';
import { returnAppName } from './returnApp.js';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from './env.js';
import { createDb, type DB } from './db/client.js';
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
import {
  clearChallengeCookie,
  clearSessionCookie,
  getCookie,
  isSecureRequest,
  SESSION_COOKIE,
  setChallengeCookie,
  setSessionCookie,
} from './auth/cookie.js';
import {
  CHALLENGE_COOKIE,
  deletePasskey,
  finishLogin,
  finishRegistration,
  listPasskeys,
  relyingParty,
  renamePasskey,
  startLogin,
  startRegistration,
} from './auth/passkeys.js';
import { googleAuthUrl, googleCallbackUrl, exchangeGoogleCode, upsertGoogleUser, safeAppRedirect } from './auth/google.js';
import { consumeToken, issueToken } from './auth/verification.js';
import { sendEmail } from './email.js';
import { verifyTurnstile } from './turnstile.js';
import { recordSecurityEvent } from './securityEvents.js';
import { isFamiliarSignIn, signInAlertEmail } from './signInAlert.js';
import { credentialAlertEmail, credentialAlertSubject, type CredentialChange } from './credentialAlert.js';
import { isFresh, stampReauth, sudoUntil, SUDO_WINDOW_MS } from './auth/stepUp.js';

export { RateLimiter } from './rateLimiter.js';

type Env2 = { Bindings: Env; Variables: { requestId: string } };
/* Helpers take a context from any route, so the path parameter stays open. Pinning it to the default
   makes every `Context<Env2, "/auth/login">` a type error at the call site. */
type Ctx = Context<Env2>;

const app = new Hono<Env2>();

// Safety net: any error a route does not handle itself is logged server-side (Workers Logs /
// `wrangler tail`) and returned as a generic 500. On the identity service especially, an internal
// failure must never leak a stack trace or implementation detail to the client.
app.onError(onUnhandledError);

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
app.use('*', async (c, next) => {
  const requestId = requestIdFrom(c.req.raw);
  c.set('requestId', requestId);
  await next();
  // On every response, not just failures: a 200 with a surprising body needs correlating as much as a 500.
  c.header('x-request-id', requestId);
});

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
const sessionMeta = (c: Ctx): SessionMeta => {
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

async function newSignInAlert(
  db: DB,
  userId: string,
  meta: SessionMeta,
  accountUrl: string,
): Promise<RenderedEmail | null> {
  const recent = await db
    .select({
      device: securityEvents.device,
      location: securityEvents.location,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(and(eq(securityEvents.userId, userId), eq(securityEvents.type, 'signed_in')))
    .orderBy(desc(securityEvents.createdAt))
    .limit(20);
  return isFamiliarSignIn(recent, meta) ? null : signInAlertEmail(meta, accountUrl);
}

/*
 * Tell the owner their sign-in method changed. Fire-and-forget on purpose: a mail outage must not
 * block someone changing a password, least of all when they are changing it in a hurry because they
 * think somebody else has it.
 */
function deliverCredentialAlert(c: Ctx, email: string, kind: CredentialChange, meta: SessionMeta): void {
  const accountUrl = new URL('/account#security', c.env.APP_URL ?? new URL(c.req.url).origin).toString();
  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: email,
      subject: credentialAlertSubject(kind),
      ...credentialAlertEmail(kind, meta, accountUrl),
    }).catch((error) => console.error('[credential alert] delivery failed:', error)),
  );
}

/**
 * Gate for actions that can cost somebody their account.
 *
 * Returns a 403 body when the session has not proved itself recently, and null when it may proceed.
 * `canUsePassword` tells the UI which proof to ask for: an account with no password has nothing to
 * type, so sending it to a password prompt would be a dead end.
 */
async function needsStepUp(
  c: Ctx,
  db: DB,
  cookie: string,
  hasPassword: boolean,
): Promise<Response | null> {
  if (await isFresh(db, cookie)) return null;
  return c.json(
    {
      error: 'REAUTH_REQUIRED',
      message: hasPassword
        ? 'Confirm your password to continue.'
        : 'Sign in with Google again, or use a password reset link from the sign-in page.',
      canUsePassword: hasPassword,
      windowMs: SUDO_WINDOW_MS,
    },
    403,
  );
}

function deliverSignInAlert(c: Ctx, email: string, alert: RenderedEmail | null): void {
  if (!alert) return;
  c.executionCtx.waitUntil(
    sendEmail(c.env, { to: email, subject: 'New sign-in to your aidenjang account', ...alert }).catch(
      (error) => console.error('[sign-in alert] delivery failed:', error),
    ),
  );
}

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
  turnstileToken: z.string().optional(),
  returnTo: z.string().optional(),
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
    ...renderEmail({
      preheader: 'Confirm this address to finish setting up your aidenjang account.',
      heading: 'Confirm your email',
      paragraphs: [
        'Your aidenjang account is made. One tap confirms this is your address, and then it works everywhere I build.',
      ],
      action: { label: 'Confirm my email', url: link(c.env, '/verify-email', verifyToken) },
      footnote: 'This link lasts 24 hours. If you did not create an account, ignore this and nothing happens.',
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
  const alert = await newSignInAlert(
    db,
    user.id,
    meta,
    new URL('/account?security=review#active-sessions', c.env.APP_URL ?? new URL(c.req.url).origin).toString(),
  );
  const { token, expiresAt } = await createSession(db, user.id, meta);
  await recordSecurityEvent(db, user.id, 'signed_in', meta);
  deliverSignInAlert(c, user.email, alert);
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
    const alert = await newSignInAlert(
      db,
      user.id,
      meta,
      new URL('/account?security=review#active-sessions', uiBase).toString(),
    );
    const { token, expiresAt } = await createSession(db, user.id, meta);
    await recordSecurityEvent(db, user.id, 'signed_in', meta);
    deliverSignInAlert(c, user.email, alert);
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
  const db = createDb(c.env);
  const user = await validateSession(db, token);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  // When the step-up window closes, so the account page can say "confirmed for another 8 minutes"
  // instead of springing a password prompt on someone mid-action. Null once it has lapsed.
  const until = await sudoUntil(db, token);
  return c.json({ user: publicUser(user), sudoUntil: until?.toISOString() ?? null });
});

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
      preheader: 'Choose a new password for your aidenjang account.',
      heading: 'Reset your password',
      paragraphs: [
        'Somebody asked to reset the password on your aidenjang account.',
        'If that was not you, you can ignore this. Your password does not change until somebody opens this link and sets a new one.',
      ],
      action: { label: 'Choose a new password', url: link(c.env, '/reset-password', token) },
      // Named as a thing not to forward, because a reset link is a password until it is used.
      footnote: 'This link lasts one hour and works once. Anybody who has it can set your password, so do not forward it.',
      app: returnAppName(parsed.data.returnTo),
    }),
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
      ...renderEmail({
      preheader: 'Your sign-in link for aidenjang. It lasts 15 minutes.',
      heading: 'Your sign-in link',
      paragraphs: ['Open this to sign in. No password needed.'],
      action: { label: 'Sign in to aidenjang', url: href },
      footnote: 'This link lasts 15 minutes and works once. Anybody who has it can sign in as you, so do not forward it.',
      app: returnAppName(parsed.data.returnTo),
    }),
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
  const account = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get();
  if (!account) return c.redirect(new URL('/login?error=magic_failed', uiBase).toString());
  const meta = sessionMeta(c);
  const alert = await newSignInAlert(
    db,
    userId,
    meta,
    new URL('/account?security=review#active-sessions', uiBase).toString(),
  );
  const { token: sessionToken, expiresAt } = await createSession(db, userId, meta);
  await recordSecurityEvent(db, userId, 'signed_in', meta);
  deliverSignInAlert(c, account.email, alert);
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
    ...renderEmail({
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
/*
 * Prove this session is still you, without signing out and back in.
 *
 * Rate limited harder than login: login is a guess against an unknown account, this is a guess
 * against one the attacker already has a cookie for, so each attempt is worth more to them.
 */
/*
 * Passkeys.
 *
 * Registration needs a signed-in session; signing in obviously does not. Both halves are rate limited,
 * the sign-in half harder: it is unauthenticated and it is the one an attacker can reach.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rp(c: Ctx) {
  return relyingParty(c.env.APP_URL, c.req.url);
}

app.get('/auth/passkeys', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  return c.json({ passkeys: await listPasskeys(db, me.id) });
});

app.post('/auth/passkeys/register/options', async (c) => {
  if (await overLimit(c, 'passkey-reg', 10, 10 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const { options, challengeId } = await startRegistration(db, rp(c), {
    id: me.id,
    email: me.email,
    displayName: me.displayName,
  });
  setChallengeCookie(c, CHALLENGE_COOKIE, challengeId, CHALLENGE_TTL_MS);
  return c.json({ options });
});

app.post('/auth/passkeys/register/verify', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);

  const body = (await c.req.json().catch(() => null)) as { response?: unknown; label?: unknown } | null;
  if (!body?.response) return c.json({ error: 'ValidationError' }, 400);

  const meta = sessionMeta(c);
  const passkey = await finishRegistration(
    db,
    rp(c),
    me.id,
    body.response as never,
    getCookie(c, CHALLENGE_COOKIE),
    typeof body.label === 'string' && body.label.trim() ? body.label : (meta.device ?? 'Passkey'),
  );
  clearChallengeCookie(c, CHALLENGE_COOKIE);
  await recordSecurityEvent(db, me.id, 'passkey_added', meta);
  return c.json({ passkey }, 201);
});

app.post('/auth/passkeys/login/options', async (c) => {
  if (await overLimit(c, 'passkey-login', 20, 10 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const db = createDb(c.env);
  const { options, challengeId } = await startLogin(db, rp(c));
  setChallengeCookie(c, CHALLENGE_COOKIE, challengeId, CHALLENGE_TTL_MS);
  // Identical for every caller, existing account or not, so this leaks no account information.
  return c.json({ options });
});

app.post('/auth/passkeys/login/verify', async (c) => {
  if (await overLimit(c, 'passkey-login-verify', 20, 10 * MIN))
    return c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);
  const db = createDb(c.env);
  const body = (await c.req.json().catch(() => null)) as { response?: unknown } | null;
  if (!body?.response) return c.json({ error: 'ValidationError' }, 400);

  const login = await finishLogin(db, rp(c), body.response as never, getCookie(c, CHALLENGE_COOKIE));
  clearChallengeCookie(c, CHALLENGE_COOKIE);

  const meta = sessionMeta(c);
  const uiBase = c.env.APP_URL ?? new URL(c.req.url).origin;
  const alert = await newSignInAlert(
    db,
    login.userId,
    meta,
    new URL('/account?security=review#active-sessions', uiBase).toString(),
  );
  const { token, expiresAt } = await createSession(db, login.userId, meta);
  await recordSecurityEvent(db, login.userId, 'signed_in', meta);
  deliverSignInAlert(c, login.email, alert);
  setSessionCookie(c, token, expiresAt);

  const user = await validateSession(db, token);
  return c.json({ user: user ? publicUser(user) : null, usedPasskey: login.label });
});

app.post('/auth/passkeys/rename', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const parsed = z
    .object({ id: z.string().min(1), label: z.string().trim().min(1).max(40) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);
  await renamePasskey(db, me.id, parsed.data.id, parsed.data.label);
  return c.json({ ok: true });
});

/*
 * Removing a passkey changes how you sign in, so it sits behind the same step-up gate as unlinking
 * Google. A stolen cookie should not be able to strip the owner's keys off the account.
 */
app.post('/auth/passkeys/delete', async (c) => {
  const cookie = getCookie(c, SESSION_COOKIE);
  const db = createDb(c.env);
  const me = cookie ? await validateSession(db, cookie) : null;
  if (!me || !cookie) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);

  const stale = await needsStepUp(c, db, cookie, me.hasPassword);
  if (stale) return stale;

  await deletePasskey(db, me.id, parsed.data.id);
  const meta = sessionMeta(c);
  await recordSecurityEvent(db, me.id, 'passkey_removed', meta);
  deliverCredentialAlert(c, me.email, 'passkey_removed', meta);
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
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

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
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);

  const row = await db.select().from(users).where(eq(users.id, sessionUser.id)).get();
  if (!row) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  if (row.passwordHash)
    return c.json(
      { error: 'PASSWORD_EXISTS', message: 'This account already has a password. Use change password instead.' },
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
  if (revoked.length > 0) await recordSecurityEvent(db, me.id, 'other_devices_signed_out', sessionMeta(c));
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
