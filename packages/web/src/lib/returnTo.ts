import { APPS } from './apps';

export interface ReturnApp {
  name: string;
  accent: string;
}

// Only allow redirects back to our own apps, so ?return_to can't be an open redirect.
export function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  const here = window.location.hostname;
  const onLoopback = here === 'localhost' || here === '127.0.0.1';
  try {
    const u = new URL(raw, window.location.origin);
    const h = u.hostname;
    const ours = h === 'aidenjang.com' || h.endsWith('.aidenjang.com');
    const loopback = h === 'localhost' || h === '127.0.0.1';
    // Loopback only when this page is itself on loopback, which is true in dev and never in
    // production. Keying it off where we are, rather than off the target, is what stops production
    // handing somebody to a service on their own machine. Mirrors safeAppRedirect on the server.
    if ((ours && u.protocol === 'https:') || (loopback && onLoopback)) return u.toString();
  } catch {
    /* fall through */
  }
  return null;
}

/** The verified app a sign-in will return to, including its visual accent for the handoff cue. */
export function returnAppFor(raw: string | null): ReturnApp | null {
  const target = safeReturnTo(raw);
  if (!target) return null;
  try {
    const url = new URL(target);
    const app = APPS.find((candidate) => {
      const production = new URL(candidate.url);
      const local = new URL(candidate.devUrl);
      return url.hostname === production.hostname || url.origin === local.origin;
    });
    return app ? { name: app.name, accent: app.accent } : null;
  } catch {
    return null;
  }
}
