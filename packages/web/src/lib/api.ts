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

export interface SessionInfo {
  id: string;
  current: boolean;
  device: string | null;
  location: string | null;
  lastSeenAt: string;
  createdAt: string;
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
  | 'other_devices_signed_out';

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

async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  const isJson = res.headers.get('content-type')?.includes('application/json') ?? false;
  const data: unknown = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const authApi = {
  me: () => req<{ user: AuthUser }>('/auth/me', 'GET'),
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
