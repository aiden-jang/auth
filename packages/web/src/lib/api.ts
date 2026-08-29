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

/** Null on anything that is not a sign-in, and on sign-ins recorded before it was tracked. */
export type SignInMethod = 'password' | 'google' | 'passkey';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  method: SignInMethod | null;
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

/** Keeps the server's code: recovering from REAUTH_REQUIRED needs it, and string-matching the prose
 *  breaks the first time anyone rewords a message. */
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
 * Every page shows `err.message` directly, so a dropped connection would put `Failed to fetch` on the
 * sign-in form. Anything that is our fault must say so, or somebody retypes a password that was right.
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
    // `=== false`, not falsy: a missing property means we do not know, and a wrong "you are offline"
    // sends somebody to reboot their router over our outage.
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
    // The server's message wins: it was written for this situation and we are guessing.
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
  register: (
    email: string,
    password: string,
    displayName: string,
    turnstileToken?: string,
    returnTo?: string | null,
  ) =>
    req<{ user: AuthUser }>('/auth/register', 'POST', {
      email,
      password,
      displayName,
      turnstileToken,
      returnTo: returnTo ?? undefined,
    }),
  logout: () => req<{ ok: boolean }>('/auth/logout', 'POST'),
  forgot: (email: string, turnstileToken?: string, returnTo?: string | null) =>
    req<{ ok: boolean }>('/auth/forgot-password', 'POST', {
      email,
      turnstileToken,
      returnTo: returnTo ?? undefined,
    }),
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
