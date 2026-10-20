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

/** Allow HTTPS app hosts; permit loopback only when the service itself is on loopback. */
export function safeAppRedirect(returnTo: string, base: string): string {
  const baseUrl = new URL(base);
  const origin = baseUrl.origin;
  const devBase = baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1';
  if (returnTo) {
    try {
      const u = new URL(returnTo, origin);
      const h = u.hostname;
      const ours = h === 'aidenjang.com' || h.endsWith('.aidenjang.com');
      const loopback = h === 'localhost' || h === '127.0.0.1';
      const web = u.protocol === 'http:' || u.protocol === 'https:';
      if (
        !u.username &&
        !u.password &&
        ((ours && u.protocol === 'https:') || (loopback && devBase && web))
      )
        return u.toString();
    } catch {
      /* not a valid URL — fall through */
    }
  }
  return new URL('/account', origin).toString();
}

/**
 * Build the OAuth callback URL from the incoming request. Behind Cloudflare the Worker can see the
 * request as `http` even though the public URL is `https`, and Google matches redirect_uri exactly
 * — so force `https` for real hosts (localhost stays `http` for dev). Used for both the auth
 * request and the token exchange so the two are byte-identical.
 */
export function googleCallbackUrl(requestUrl: string): string {
  const u = new URL('/auth/google/callback', requestUrl);
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') u.protocol = 'https:';
  return u.toString();
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

/** Exchange an auth code for an identity; callers handle transport failures. */
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
    // Provider replies can carry credentials; keep response bodies out of logs.
    console.error('[google] token exchange HTTP', res.status);
    return null;
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) {
    console.error('[google] token response had no id_token');
    return null;
  }

  const claims = decodeJwtPayload(data.id_token);
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  if (!sub || !email) {
    console.error(
      '[google] id_token missing sub/email; claims keys:',
      Object.keys(claims ?? {}).join(','),
    );
    return null;
  }
  if (claims?.aud !== clientId) {
    // Usually a stray quote/whitespace in GOOGLE_CLIENT_ID (.dev.vars) — log both to compare.
    console.error(
      '[google] id_token aud mismatch. token aud:',
      String(claims?.aud),
      'expected:',
      clientId,
    );
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

/** Existing Google IDs identify an account; linking or creating by email requires verified ownership. */
export async function upsertGoogleUser(
  db: DB,
  identity: GoogleIdentity,
): Promise<AuthedUser | null> {
  const toAuthed = (u: {
    id: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
  }): AuthedUser => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
  });

  const byGoogle = await db.select().from(users).where(eq(users.googleId, identity.sub)).get();
  if (byGoogle) return toAuthed(byGoogle);

  if (!identity.emailVerified) return null;

  const byEmail = await db.select().from(users).where(eq(users.email, identity.email)).get();
  if (byEmail) {
    await db
      .update(users)
      .set({ googleId: identity.sub, emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, byEmail.id));
    return toAuthed({ ...byEmail, emailVerified: true });
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: identity.email,
    passwordHash: null,
    googleId: identity.sub,
    displayName: identity.name,
    emailVerified: true,
  });
  return { id, email: identity.email, displayName: identity.name, emailVerified: true };
}
