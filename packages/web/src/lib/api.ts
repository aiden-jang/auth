// Same-origin with the auth Worker in prod (accounts.aidenjang.com); dev proxies /auth.
const BASE = import.meta.env.VITE_AUTH_URL ?? '';

// "Continue with Google" is shown only when the build opts in (server must also have the OAuth
// client configured). Mirrors the Turnstile gating pattern.
export const googleEnabled = (import.meta.env.VITE_GOOGLE_ENABLED as string | undefined) === 'true';

/** Full-page link that kicks off the Google OAuth redirect flow, preserving return_to. */
export function googleLoginUrl(returnTo?: string | null): string {
  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
  return `${BASE}/auth/google${q}`;
}

/** Full-page link that links Google to the signed-in account (requires an active session). */
export function googleConnectUrl(returnTo = '/account'): string {
  return `${BASE}/auth/google?link=1&return_to=${encodeURIComponent(returnTo)}`;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  /** False for Google-only accounts, which can add a password from the account page. */
  hasPassword: boolean;
  /** Whether a Google account is linked. */
  hasGoogle: boolean;
}

export interface Passkey {
  id: string;
  label: string;
  /** Synced to a provider's cloud, so losing the device does not lose the key. */
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  device: string | null;
  location: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}

export type SecurityEventType =
  | 'account_created'
  | 'signed_in'
  | 'email_verified'
  | 'password_added'
  | 'password_changed'
  | 'password_reset'
  | 'google_connected'
  | 'google_disconnected'
  | 'device_renamed'
  | 'device_signed_out'
  | 'other_devices_signed_out'
  | 'passkey_added'
  | 'passkey_removed';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  device: string | null;
  location: string | null;
  createdAt: string;
}

export interface AccountExport {
  exportedAt: string;
  account: {
    email: string;
    displayName: string;
    emailVerified: boolean;
    signInMethods: string[];
    createdAt: string;
    updatedAt: string;
  };
  activeSessions: Array<{
    device: string | null;
    location: string | null;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
  }>;
  securityActivity: Array<Omit<SecurityEvent, 'id'>>;
}

/**
 * A failed request, with the server's error code kept.
 *
 * The old helper threw a bare Error carrying only `message`, which is fine for showing a sentence
 * and useless for reacting to one. Recovering from REAUTH_REQUIRED needs the code and the
 * `canUsePassword` hint alongside it, and string-matching the prose would break the first time
 * anyone rewords a message. Still an Error subclass, so every existing `err.message` path is intact.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** The server refused because this session has not proved itself recently enough. */
export function isReauthRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'REAUTH_REQUIRED';
}

/** Whether the account has a password to confirm with. False means send them to Google or email. */
export function reauthCanUsePassword(err: unknown): boolean {
  return err instanceof ApiError && err.details.canUsePassword === true;
}

/**
 * What to say when the server did not give us a sentence to say.
 *
 * Every page here shows `err.message` directly, which was fine for the errors this service writes
 * (they are already human) and bad for everything else. A dropped connection surfaced the browser's
 * own `Failed to fetch`, and a proxy error page surfaced `Request failed (502)`. Both were shown
 * verbatim on the sign-in form, which is the single worst place in the whole platform to look broken
 * and explain nothing: somebody who cannot get in cannot get anywhere.
 *
 * A status code is not a message. Anything that is genuinely our fault says so, because "try again"
 * is useless advice if the problem is at this end and the person is about to retype their password
 * assuming they got it wrong.
 */
function describeStatus(status: number): string {
  if (status === 429) return 'Too many tries in a row. Give it a minute and go again.';
  if (status === 408 || status === 504) return 'That took too long to answer. Try again in a moment.';
  if (status === 502 || status === 503) return 'The sign-in service is briefly unavailable. Try again shortly.';
  if (status >= 500) return 'Something broke on our end, not yours. Try again in a moment.';
  if (status === 404) return 'That link or page is gone.';
  if (status === 403) return 'That is not allowed from here.';
  return 'That did not go through. Try again in a moment.';
}

async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    /*
     * fetch only rejects for transport failures: offline, DNS, a killed connection, CORS. Caught here
     * rather than at 25 call sites, all of which already render err.message and none of which should
     * have to know what a TypeError from fetch looks like.
     */
    // `onLine === false` rather than falsy: where the property is missing we do not know, and
    // telling somebody they are offline when they are not sends them to reboot their router over
    // what was actually our outage.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(
      offline
        ? 'You appear to be offline. Reconnect and try again.'
        : 'Could not reach the sign-in service. Check your connection and try again.',
      'NETWORK',
      0,
    );
  }

  const isJson = res.headers.get('content-type')?.includes('application/json') ?? false;
  // A non-JSON body on an error is a proxy or edge error page, never something worth showing.
  const data: unknown = isJson ? await res.json().catch(() => undefined) : undefined;
  if (!res.ok) {
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    // The server's own message wins: it is written for this exact situation and we are guessing.
    const message = typeof obj.message === 'string' ? obj.message : describeStatus(res.status);
    const code = typeof obj.error === 'string' ? obj.error : `HTTP_${res.status}`;
    throw new ApiError(message, code, res.status, obj);
  }
  return data as T;
}

export const authApi = {
  me: () => req<{ user: AuthUser; sudoUntil: string | null }>('/auth/me', 'GET'),
  /** Re-confirm the current session with a password, re-opening the step-up window. */
  reauth: (password: string) =>
    req<{ ok: boolean; sudoUntil: string | null }>('/auth/reauth', 'POST', { password }),
  login: (email: string, password: string, turnstileToken?: string) =>
    req<{ user: AuthUser }>('/auth/login', 'POST', { email, password, turnstileToken }),
  register: (email: string, password: string, displayName: string, turnstileToken?: string) =>
    req<{ user: AuthUser }>('/auth/register', 'POST', { email, password, displayName, turnstileToken }),
  logout: () => req<{ ok: boolean }>('/auth/logout', 'POST'),
  magicLink: (email: string, returnTo?: string | null, turnstileToken?: string) =>
    req<{ ok: boolean }>('/auth/magic-link', 'POST', {
      email,
      returnTo: returnTo ?? undefined,
      turnstileToken,
    }),
  forgot: (email: string, turnstileToken?: string) =>
    req<{ ok: boolean }>('/auth/forgot-password', 'POST', { email, turnstileToken }),
  reset: (token: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/reset-password', 'POST', { token, newPassword }),
  updateProfile: (displayName: string) =>
    req<{ user: AuthUser }>('/auth/update-profile', 'POST', { displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/change-password', 'POST', { currentPassword, newPassword }),
  setPassword: (newPassword: string) =>
    req<{ ok: boolean }>('/auth/set-password', 'POST', { newPassword }),
  disconnectGoogle: () => req<{ ok: boolean }>('/auth/disconnect-google', 'POST'),
  listPasskeys: () => req<{ passkeys: Passkey[] }>('/auth/passkeys', 'GET'),
  passkeyRegisterOptions: () => req<{ options: unknown }>('/auth/passkeys/register/options', 'POST'),
  passkeyRegisterVerify: (response: unknown, label?: string) =>
    req<{ passkey: Passkey }>('/auth/passkeys/register/verify', 'POST', { response, label }),
  passkeyLoginOptions: () => req<{ options: unknown }>('/auth/passkeys/login/options', 'POST'),
  passkeyLoginVerify: (response: unknown) =>
    req<{ user: AuthUser; usedPasskey: string }>('/auth/passkeys/login/verify', 'POST', { response }),
  renamePasskey: (id: string, label: string) =>
    req<{ ok: boolean }>('/auth/passkeys/rename', 'POST', { id, label }),
  deletePasskey: (id: string) => req<{ ok: boolean }>('/auth/passkeys/delete', 'POST', { id }),
  listSessions: () => req<{ sessions: SessionInfo[] }>('/auth/sessions', 'GET'),
  listSecurityEvents: () => req<{ events: SecurityEvent[] }>('/auth/security-events', 'GET'),
  exportAccount: () => req<AccountExport>('/auth/export', 'GET'),
  renameSession: (id: string, label: string) =>
    req<{ session: Pick<SessionInfo, 'id' | 'device'> }>('/auth/sessions/rename', 'POST', { id, label }),
  revokeSession: (id: string) => req<{ ok: boolean }>('/auth/sessions/revoke', 'POST', { id }),
  revokeOtherSessions: () => req<{ ok: boolean }>('/auth/sessions/revoke-others', 'POST'),
  deleteAccount: (body: { password?: string; confirm?: string }) =>
    req<{ ok: boolean }>('/auth/delete-account', 'POST', body),
  verifyEmail: (token: string) => req<{ ok: boolean }>('/auth/verify-email', 'POST', { token }),
  resendVerification: () => req<{ ok: boolean }>('/auth/resend-verification', 'POST'),
};
