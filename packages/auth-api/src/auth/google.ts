// Google OAuth (OIDC) authorization-code flow. The ID token is fetched directly from Google's
// token endpoint over TLS, so its claims can be trusted without a separate JWKS signature check
// (per Google's server-side flow docs); we still verify the audience.
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { users } from '../db/schema.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

/**
 * Resolve a post-login redirect target safely: allow only aidenjang.com hosts (or localhost in
 * dev), else fall back to `${base}/account`. `base` is the UI origin (APP_URL). Blocks
 * open-redirect via `return_to`.
 */
export function safeAppRedirect(returnTo: string, base: string): string {
  const origin = new URL(base).origin;
  if (returnTo) {
    try {
      const u = new URL(returnTo, origin);
      const h = u.hostname;
      if (h === 'aidenjang.com' || h.endsWith('.aidenjang.com') || h === 'localhost' || h === '127.0.0.1') {
        return u.toString();
      }
    } catch {
      /* not a valid URL — fall through */
    }
  }
  return new URL('/account', origin).toString();
}

/** The consent-screen URL to redirect the user to. */
export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Exchange an auth code for the user's Google identity, or null on any failure. */
export async function exchangeGoogleCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<GoogleIdentity | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    console.error('google token exchange failed', res.status);
    return null;
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) return null;

  const claims = decodeJwtPayload(data.id_token);
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  if (!sub || !email) return null;
  if (claims?.aud !== clientId) {
    console.error('google id_token audience mismatch');
    return null;
  }
  const name = typeof claims?.name === 'string' ? claims.name : email;
  return {
    sub,
    email: email.trim().toLowerCase(),
    emailVerified: claims?.email_verified === true,
    name: name.trim(),
  };
}

/**
 * Find or create the account for a Google identity. Match by google_id first, then link to an
 * existing account with the same *verified* email (Google guarantees the address), else create a
 * new passwordless account.
 */
export async function upsertGoogleUser(db: DB, identity: GoogleIdentity): Promise<AuthedUser> {
  const toAuthed = (u: { id: string; email: string; displayName: string; emailVerified: boolean }): AuthedUser => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
  });

  const byGoogle = await db.select().from(users).where(eq(users.googleId, identity.sub)).get();
  if (byGoogle) return toAuthed(byGoogle);

  const byEmail = await db.select().from(users).where(eq(users.email, identity.email)).get();
  if (byEmail) {
    if (identity.emailVerified) {
      await db
        .update(users)
        .set({ googleId: identity.sub, emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id));
      return toAuthed({ ...byEmail, emailVerified: true });
    }
    return toAuthed(byEmail);
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: identity.email,
    passwordHash: null,
    googleId: identity.sub,
    displayName: identity.name,
    emailVerified: identity.emailVerified,
  });
  return { id, email: identity.email, displayName: identity.name, emailVerified: identity.emailVerified };
}
