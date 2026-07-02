// Only allow redirects back to our own apps, so ?return_to can't be an open redirect.
export function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === 'aidenjang.com' || h.endsWith('.aidenjang.com')) {
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return null;
}
