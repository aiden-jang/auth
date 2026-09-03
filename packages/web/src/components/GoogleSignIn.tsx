import type { ReactNode } from 'react';
import { googleEnabled, googleLoginUrl } from '../lib/api';

/**
 * "Continue with Google" — a full-page redirect (no embedded SDK, so no CSP changes) plus an "or"
 * divider. Renders nothing unless the build opts in via VITE_GOOGLE_ENABLED.
 */
export function GoogleSignIn({ returnTo }: { returnTo?: string | null }): ReactNode {
  if (!googleEnabled) return null;
  return (
    <>
      <a
        href={googleLoginUrl(returnTo)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-field px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/60 hover:bg-white/5"
      >
        <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        Continue with Google
      </a>
      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
