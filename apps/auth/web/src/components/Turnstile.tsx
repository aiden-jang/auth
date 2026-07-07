import { useEffect, useRef, type ReactNode } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// True when a site key is configured at build time. Pages use this to require a
// solved token before enabling submit; when false, Turnstile is off entirely
// (and the backend's turnstileOk() skips the check to match).
export const turnstileEnabled = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
    },
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile failed to load'));
    document.head.appendChild(s);
  });
}

/**
 * Cloudflare Turnstile widget. Renders only when VITE_TURNSTILE_SITE_KEY is set;
 * otherwise it renders nothing so unconfigured/dev environments work unchanged.
 * Calls onToken with the solved token, and with '' when it expires or errors so
 * the form re-requires a solve.
 */
export function Turnstile({ onToken }: { onToken: (token: string) => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep the latest callback without re-running the render effect on every parent render.
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    void loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token) => cb.current(token),
          'expired-callback': () => cb.current(''),
          'error-callback': () => cb.current(''),
          theme: 'auto',
        });
      })
      .catch(() => {
        // Leave the form usable; the backend still gates when configured.
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-1" />;
}
