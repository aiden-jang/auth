export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

const ME_PATH = '/auth/me';

/**
 * The user this request's cookie proves, or null. Call it in an app's Worker with the incoming
 * Request and the auth service's base URL.
 *
 * Prefer `resolveSession`: this cannot tell "signed out" from "Accounts is down".
 */
export async function getSessionUser(
  request: Request,
  authBaseUrl: string,
): Promise<AuthUser | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const res = await fetch(new URL(ME_PATH, authBaseUrl), { headers: { cookie } });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: AuthUser };
  return data.user ?? null;
}

export type SessionOutcome =
  | { state: 'signed-in'; user: AuthUser }
  | { state: 'signed-out' }
  /** Accounts could not be asked, so this says nothing about whether they are signed in. */
  | { state: 'unavailable' };

/**
 * Resolve the caller's session, keeping "signed out" and "could not ask" apart. An outage read as
 * a sign-out offers to sign in someone who already is, and to import guest data over synced data.
 *
 * Only a reachable service refusing the cookie is signed out. Unreachable, 5xx, a rate limit, a
 * wrong base URL or an unparseable body are all `unavailable` -- none is evidence about the person.
 */
export async function resolveSession(
  request: Request,
  authBaseUrl: string,
): Promise<SessionOutcome> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return { state: 'signed-out' };

  let res: Response;
  try {
    res = await fetch(new URL(ME_PATH, authBaseUrl), { headers: { cookie } });
  } catch {
    return { state: 'unavailable' };
  }

  if (res.status === 401 || res.status === 403) return { state: 'signed-out' };
  if (!res.ok) return { state: 'unavailable' };

  let data: { user?: AuthUser };
  try {
    data = (await res.json()) as { user?: AuthUser };
  } catch {
    return { state: 'unavailable' };
  }
  return data.user ? { state: 'signed-in', user: data.user } : { state: 'signed-out' };
}

/** URL of the central login page, returning the user to `returnTo` after they sign in. */
export function loginUrl(authBaseUrl: string, returnTo: string): string {
  const u = new URL('/login', authBaseUrl);
  u.searchParams.set('return_to', returnTo);
  return u.toString();
}

/** URL of the central sign-up page, returning the user to `returnTo` after they register. */
export function signupUrl(authBaseUrl: string, returnTo: string): string {
  const u = new URL('/signup', authBaseUrl);
  u.searchParams.set('return_to', returnTo);
  return u.toString();
}

/** URL of the central logout, returning the user to `returnTo` afterward. */
export function logoutUrl(authBaseUrl: string, returnTo: string): string {
  const u = new URL('/logout', authBaseUrl);
  u.searchParams.set('return_to', returnTo);
  return u.toString();
}

/** Where the "made by aiden jang" credit points. */
export const SITE_AUTHOR_URL = 'https://www.aidenjang.com';

export interface FooterLink {
  label: string;
  href: string;
  /** true for off-site links (open in a new tab, need rel=noreferrer). */
  external?: boolean;
}

/**
 * The author credit plus the legal pages, which live once on the account app. Content only: each
 * app renders these in its own theme.
 */
export function siteFooterLinks(authBaseUrl: string): FooterLink[] {
  return [
    { label: 'made by aiden jang', href: SITE_AUTHOR_URL, external: true },
    { label: 'privacy', href: new URL('/privacy', authBaseUrl).toString() },
    { label: 'terms', href: new URL('/terms', authBaseUrl).toString() },
  ];
}
