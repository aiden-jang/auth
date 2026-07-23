export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

/**
 * Validate the caller's session by forwarding their cookie to the shared auth service.
 * Use inside an app's Worker: pass the incoming Request and the auth service base URL
 * (e.g. "https://accounts.aidenjang.com"). Returns the user, or null if unauthenticated.
 */
export async function getSessionUser(
  request: Request,
  authBaseUrl: string,
): Promise<AuthUser | null> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const res = await fetch(new URL('/auth/me', authBaseUrl), { headers: { cookie } });
  if (!res.ok) return null;
  const data = (await res.json()) as { user?: AuthUser };
  return data.user ?? null;
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
 * The shared site-footer link model: the author credit plus the legal pages, which live once
 * on the account app (privacy/terms are derived from `authBaseUrl` so dev points local).
 * Content only — each app renders these in its own theme so the footer matches the app.
 */
export function siteFooterLinks(authBaseUrl: string): FooterLink[] {
  return [
    { label: 'made by aiden jang', href: SITE_AUTHOR_URL, external: true },
    { label: 'privacy', href: new URL('/privacy', authBaseUrl).toString() },
    { label: 'terms', href: new URL('/terms', authBaseUrl).toString() },
  ];
}
