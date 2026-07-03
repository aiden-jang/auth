import type { ReactNode } from 'react';
import { AUTH_ORIGIN } from '../lib/api';

// Legal pages live once on the shared account app (accounts.aidenjang.com/privacy, /terms).
// Building the URLs from AUTH_ORIGIN keeps dev pointing at the local auth service.
const privacyUrl = new URL('/privacy', AUTH_ORIGIN).toString();
const termsUrl = new URL('/terms', AUTH_ORIGIN).toString();

export function SiteFooter(): ReactNode {
  return (
    <footer className="mx-auto flex w-full max-w-3xl flex-col items-center gap-1 px-5 py-8 text-center text-xs text-muted">
      <p>owewell · split the bill, keep the friends</p>
      <nav className="flex gap-4">
        <a href={privacyUrl} className="hover:text-accent hover:underline">
          Privacy
        </a>
        <a href={termsUrl} className="hover:text-accent hover:underline">
          Terms
        </a>
      </nav>
    </footer>
  );
}
