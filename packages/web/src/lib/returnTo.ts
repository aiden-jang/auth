import { APPS } from './apps';

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

/** A human label for a verified return destination, for the login handoff. */
export function returnAppName(raw: string | null): string | null {
  const target = safeReturnTo(raw);
  if (!target) return null;
  try {
    const url = new URL(target);
    const app = APPS.find((candidate) => {
      const production = new URL(candidate.url);
      const local = new URL(candidate.devUrl);
      return url.hostname === production.hostname || url.origin === local.origin;
    });
    return app?.name ?? null;
  } catch {
    return null;
  }
}
