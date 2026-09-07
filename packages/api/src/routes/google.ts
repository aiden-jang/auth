/* Sign in with Google, and linking a Google account to an existing one. */
import { Hono } from 'hono';
import { writeEvent } from '../events.js';
import { eq } from 'drizzle-orm';
import { setCookie, deleteCookie } from 'hono/cookie';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { createSession, validateSession } from '../auth/session.js';
import { getCookie, isSecureRequest, SESSION_COOKIE, setSessionCookie } from '../auth/cookie.js';
import {
  googleAuthUrl,
  googleCallbackUrl,
  exchangeGoogleCode,
  upsertGoogleUser,
  safeAppRedirect,
} from '../auth/google.js';
import { recordSecurityEvent } from '../securityEvents.js';
import {
  deliverSignInAlert,
  newSignInAlert,
  sessionMeta,
  type Env2,
  unauthenticated,
} from '../http/context.js';

const app = new Hono<Env2>();

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
    if (!authed) return unauthenticated(c);
  }
  const state = crypto.randomUUID();
  const redirectUri = googleCallbackUrl(c.req.url);
  // Short-lived CSRF nonce + return target; SameSite=Lax so it survives the top-level redirect back.
  setCookie(
    c,
    GOOGLE_STATE_COOKIE,
    JSON.stringify({ s: state, r: c.req.query('return_to') ?? '', link }),
    {
      httpOnly: true,
      secure: isSecureRequest(c),
      sameSite: 'Lax',
      path: '/auth/google',
      maxAge: 600,
      ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
    },
  );
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
      const taken = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.googleId, identity.sub))
        .get();
      if (taken && taken.id !== current.id) return fail('google_already_linked');
      await db
        .update(users)
        .set({
          googleId: identity.sub,
          // Only let Google vouch for the email if it's the same address on this account.
          ...(identity.emailVerified && identity.email === current.email
            ? { emailVerified: true }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, current.id));
      await recordSecurityEvent(db, current.id, 'google_connected', sessionMeta(c));
      return c.redirect(safeAppRedirect(saved.r ?? '/account', uiBase));
    }

    const user = await upsertGoogleUser(db, identity);
    // Google would not vouch for the address, so it cannot be used to reach an account.
    if (!user) return fail('email_unverified');
    const meta = sessionMeta(c);
    const alert = await newSignInAlert(
      db,
      user.id,
      meta,
      new URL('/account?security=review#active-sessions', uiBase).toString(),
      'google',
    );
    const { token, expiresAt } = await createSession(db, user.id, meta);
    writeEvent(c.env, 'signed_in', 'google');
    await recordSecurityEvent(db, user.id, 'signed_in', meta, 'google');
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

export default app;
