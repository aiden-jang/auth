import { useEffect, useRef, useState, type ReactNode } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// When false Turnstile is off entirely, and the backend's turnstileOk() skips the check to match.
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
  reset: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoad) return scriptLoad;
  const script = document.createElement('script');
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  let timer: number;
  scriptLoad = new Promise<void>((resolve, reject) => {
    script.onload = () =>
      window.turnstile ? resolve() : reject(new Error('Security check unavailable'));
    script.onerror = () => reject(new Error('Security check unavailable'));
    timer = window.setTimeout(() => reject(new Error('Security check timed out')), 15_000);
    document.head.appendChild(script);
  })
    .catch((error: unknown) => {
      script.remove();
      scriptLoad = null;
      throw error;
    })
    .finally(() => window.clearTimeout(timer));
  return scriptLoad;
}

/**
 * Renders nothing without a site key, so dev works unchanged. Calls onToken with '' on expiry or
 * error, so the form re-requires a solve.
 */
export function Turnstile({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string) => void;
  /** Bump this (e.g. after a failed submit) to discard the spent token and fetch a fresh one. */
  resetSignal?: number;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Keep the latest callback without re-running the render effect on every parent render. Written
  // in an effect, not during render: a render can be thrown away, and this ref outlives it.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  });

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
          'error-callback': () => {
            cb.current('');
            setError('The security check failed. Try loading it again.');
          },
          theme: 'auto',
        });
      })
      .catch(() => {
        if (!cancelled)
          setError('Couldn’t load the security check. Check your connection and try again.');
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [attempt]);

  // Tokens are single-use; after a failed submit the parent bumps resetSignal to fetch a fresh
  // one. Reusing the spent token fails siteverify as `timeout-or-duplicate` (the "widget says
  // success but login 400s" bug). reset() re-runs the challenge, which re-fires the callback.
  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return (
    <div>
      <div ref={ref} className="mt-1 flex justify-center" />
      {error && (
        <div className="mt-2 text-sm">
          <p role="alert" className="text-neg">
            {error}
          </p>
          <button
            type="button"
            className="mt-1 min-h-11 font-medium text-accent"
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Reload security check
          </button>
        </div>
      )}
    </div>
  );
}
