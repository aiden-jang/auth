const RECENT_EMAIL_KEY = 'aidenjang:recent-email';
const RECENT_ACCOUNTS_KEY = 'aidenjang:recent-accounts:v1';
const MAX_RECENT_ACCOUNTS = 3;

export type RecentLoginMethod = 'password' | 'email-link';

export interface RecentAccount {
  email: string;
  method: RecentLoginMethod;
  lastUsedAt: string;
}

export function recentAccountTimeLabel(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() === 1970) return 'used on this device';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const difference = Math.round((today - day) / 86_400_000);
  if (difference <= 0) return 'used today';
  if (difference === 1) return 'used yesterday';
  return `used ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) return email;
  const visible = local.length > 3 ? `${local[0]}${local[1]}` : local[0];
  return `${visible}•••@${domain}`;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function decodeRecentAccounts(raw: string | null): RecentAccount[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentAccount => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<RecentAccount>;
      return typeof value.email === 'string' && validEmail(value.email) &&
        (value.method === 'password' || value.method === 'email-link') &&
        typeof value.lastUsedAt === 'string' && !Number.isNaN(new Date(value.lastUsedAt).getTime());
    }).slice(0, MAX_RECENT_ACCOUNTS);
  } catch {
    return [];
  }
}

export function readRecentAccounts(): RecentAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const accounts = decodeRecentAccounts(window.localStorage.getItem(RECENT_ACCOUNTS_KEY));
    if (accounts.length > 0) return accounts;
    const legacy = window.localStorage.getItem(RECENT_EMAIL_KEY)?.trim().toLowerCase() ?? '';
    return validEmail(legacy)
      ? [{ email: legacy, method: 'password', lastUsedAt: new Date(0).toISOString() }]
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentAccount(email: string, method: RecentLoginMethod): void {
  try {
    const normalized = email.trim().toLowerCase();
    if (!validEmail(normalized)) return;
    const accounts = readRecentAccounts().filter(account => account.email !== normalized);
    const next = [{ email: normalized, method, lastUsedAt: new Date().toISOString() }, ...accounts].slice(0, MAX_RECENT_ACCOUNTS);
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next));
    window.localStorage.removeItem(RECENT_EMAIL_KEY);
  } catch {
    // Device memory is optional; it never participates in authentication.
  }
}

export function forgetRecentAccount(email: string): void {
  try {
    const next = readRecentAccounts().filter(account => account.email !== email.trim().toLowerCase());
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next));
    window.localStorage.removeItem(RECENT_EMAIL_KEY);
  } catch {
    // Nothing else to clear.
  }
}
