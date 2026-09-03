/* The WebAuthn ceremonies, and managing the keys they produce. */
import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { createSession, validateSession } from '../auth/session.js';
import {
  clearChallengeCookie,
  getCookie,
  SESSION_COOKIE,
  setChallengeCookie,
  setSessionCookie,
} from '../auth/cookie.js';
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
} from '../auth/passkeys.js';
import { recordSecurityEvent } from '../securityEvents.js';
import {
  deliverCredentialAlert,
  deliverSignInAlert,
  MIN,
  needsStepUp,
  newSignInAlert,
  overLimit,
  publicUser,
  sessionMeta,
  type Ctx,
  type Env2,
} from '../http/context.js';

const app = new Hono<Env2>();

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
  const stale = await needsStepUp(c, db, cookie!, me.hasPassword);
  if (stale) return stale;

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

  const stale = await needsStepUp(c, db, cookie!, me.hasPassword);
  if (stale) return stale;

  const body = (await c.req.json().catch(() => null)) as {
    response?: unknown;
    label?: unknown;
  } | null;
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
  deliverCredentialAlert(c, me.email, 'passkey_added', meta);
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

  const login = await finishLogin(
    db,
    rp(c),
    body.response as never,
    getCookie(c, CHALLENGE_COOKIE),
  );
  clearChallengeCookie(c, CHALLENGE_COOKIE);

  const meta = sessionMeta(c);
  const uiBase = c.env.APP_URL ?? new URL(c.req.url).origin;
  const alert = await newSignInAlert(
    db,
    login.userId,
    meta,
    new URL('/account?security=review#active-sessions', uiBase).toString(),
    'passkey',
  );
  const { token, expiresAt } = await createSession(db, login.userId, meta);
  await recordSecurityEvent(db, login.userId, 'signed_in', meta, 'passkey');
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
  const parsed = z
    .object({ id: z.string().min(1) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError' }, 400);

  const stale = await needsStepUp(c, db, cookie, me.hasPassword);
  if (stale) return stale;

  await deletePasskey(db, me.id, parsed.data.id);
  const meta = sessionMeta(c);
  await recordSecurityEvent(db, me.id, 'passkey_removed', meta);
  deliverCredentialAlert(c, me.email, 'passkey_removed', meta);
  return c.json({ ok: true });
});

export default app;
