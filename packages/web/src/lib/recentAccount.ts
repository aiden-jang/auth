const RECENT_EMAIL_KEY = 'aidenjang:recent-email';

export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) return email;
  const visible = local.length > 3 ? `${local[0]}${local[1]}` : local[0];
  return `${visible}•••@${domain}`;
}

export function readRecentEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(RECENT_EMAIL_KEY)?.trim() ?? '';
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberRecentEmail(email: string): void {
  try {
    window.localStorage.setItem(RECENT_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // Device memory is optional; it never participates in authentication.
  }
}

export function forgetRecentEmail(): void {
  try {
    window.localStorage.removeItem(RECENT_EMAIL_KEY);
  } catch {
    // Nothing else to clear.
  }
}
