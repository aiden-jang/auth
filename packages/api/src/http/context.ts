import type { Context } from 'hono';
import { safeAppRedirect } from '../auth/google.js';
import { and, desc, eq } from 'drizzle-orm';
import { getCookie, SESSION_COOKIE } from '../auth/cookie.js';
import type { Env } from '../env.js';
import type { DB } from '../db/client.js';
import { securityEvents } from '../db/schema.js';
import { validateSession, type SessionMeta, type SessionUser } from '../auth/session.js';
import { isFresh, SUDO_WINDOW_MS } from '../auth/stepUp.js';
import { deviceLabel } from '../device.js';
import { sendEmail } from '../email.js';
import { type RenderedEmail } from '../emailLayout.js';
import { isFamiliarSignIn, signInAlertEmail } from '../signInAlert.js';
import {
  credentialAlertEmail,
  credentialAlertSubject,
  type CredentialChange,
} from '../credentialAlert.js';
import type { SignInMethod } from '../securityEvents.js';
import { verifyTurnstile } from '../turnstile.js';

/* What every route needs and no route owns. */

export type Env2 = { Bindings: Env; Variables: { requestId: string } };

/* Helpers take a context from any route, so the path parameter stays open. Pinning it to the default
   makes every `Context<Env2, "/auth/login">` a type error at the call site. */
export type Ctx = Context<Env2>;

/* Apps switch on `error`, and a typo in one is not a compile error here -- it surfaces as some
   other app's error handling quietly not matching. Written once. */
export const unauthenticated = (c: Ctx) => c.json({ error: 'UNAUTHENTICATED' }, 401);

export const rateLimited = (c: Ctx) =>
  c.json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, 429);

export async function signedIn(c: Ctx, db: DB): Promise<SessionUser | null> {
  const cookie = getCookie(c, SESSION_COOKIE);
  return cookie ? validateSession(db, cookie) : null;
}

const clientIp = (c: Ctx): string => c.req.header('cf-connecting-ip') ?? 'local';

export async function overLimit(
  c: Ctx,
  action: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const ns = c.env.RATE_LIMITER;
  const stub = ns.get(ns.idFromName(`${action}:${clientIp(c)}`));
  return !(await stub.hit(limit, windowMs));
}

/** Passes when Turnstile is unconfigured (dev); otherwise the token must verify. */
export async function turnstileOk(c: Ctx, token: string | undefined): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  return verifyTurnstile(c.env.TURNSTILE_SECRET, token, clientIp(c));
}

export const MIN = 60_000;
export function link(env: Env, path: string, token: string, returnTo?: string): string {
  const href = `${env.APP_URL ?? ''}${path}?token=${token}`;
  if (!returnTo || !env.APP_URL) return href;
  const target = safeAppRedirect(returnTo, env.APP_URL);
  if (target === new URL('/account', env.APP_URL).toString()) return href;
  return `${href}&return_to=${encodeURIComponent(target)}`;
}

// Capture who/where a session was created from, for the active-sessions list. Device is a parsed
// label (not the raw UA); location is a coarse city/country from Cloudflare's edge (not the raw IP).
export const sessionMeta = (c: Ctx): SessionMeta => {
  const cf = c.req.raw.cf as { city?: string; country?: string } | undefined;
  const location = [cf?.city, cf?.country].filter(Boolean).join(', ') || null;
  return { device: deviceLabel(c.req.header('user-agent')), location };
};

export const publicUser = (u: {
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

export async function newSignInAlert(
  db: DB,
  userId: string,
  meta: SessionMeta,
  accountUrl: string,
  method: SignInMethod,
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
  return isFamiliarSignIn(recent, meta) ? null : signInAlertEmail(meta, accountUrl, method);
}

/* Best-effort by design -- see credentialAlert.ts for why. */
export function deliverCredentialAlert(
  c: Ctx,
  email: string,
  kind: CredentialChange,
  meta: SessionMeta,
): void {
  const accountUrl = new URL(
    '/account#security',
    c.env.APP_URL ?? new URL(c.req.url).origin,
  ).toString();
  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: email,
      subject: credentialAlertSubject(kind),
      ...credentialAlertEmail(kind, meta, accountUrl),
    }).catch((error) => console.error('[credential alert] delivery failed:', error)),
  );
}

/**
 * Gate for actions that can cost somebody their account. Null means proceed.
 *
 * `canUsePassword` tells the UI which proof to ask for: an account with no password has nothing to
 * type, so sending it to a password prompt would be a dead end.
 */
export async function needsStepUp(
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

export function deliverSignInAlert(c: Ctx, email: string, alert: RenderedEmail | null): void {
  if (!alert) return;
  c.executionCtx.waitUntil(
    sendEmail(c.env, {
      to: email,
      subject: 'New sign-in to your aidenjang account',
      ...alert,
    }).catch((error) => console.error('[sign-in alert] delivery failed:', error)),
  );
}
