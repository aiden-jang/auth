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

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  /** False for Google-only accounts, which can add a password from the account page. */
  hasPassword: boolean;
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
  verifyEmail: (token: string) => req<{ ok: boolean }>('/auth/verify-email', 'POST', { token }),
  resendVerification: () => req<{ ok: boolean }>('/auth/resend-verification', 'POST'),
};
