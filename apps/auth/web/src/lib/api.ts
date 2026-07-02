// Same-origin with the auth Worker in prod (accounts.aidenjang.com); dev proxies /auth.
const BASE = import.meta.env.VITE_AUTH_URL ?? '';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
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
  login: (email: string, password: string) =>
    req<{ user: AuthUser }>('/auth/login', 'POST', { email, password }),
  register: (email: string, password: string, displayName: string) =>
    req<{ user: AuthUser }>('/auth/register', 'POST', { email, password, displayName }),
  logout: () => req<{ ok: boolean }>('/auth/logout', 'POST'),
  forgot: (email: string) => req<{ ok: boolean }>('/auth/forgot-password', 'POST', { email }),
  reset: (token: string, newPassword: string) =>
    req<{ ok: boolean }>('/auth/reset-password', 'POST', { token, newPassword }),
  verifyEmail: (token: string) => req<{ ok: boolean }>('/auth/verify-email', 'POST', { token }),
  resendVerification: () => req<{ ok: boolean }>('/auth/resend-verification', 'POST'),
};
