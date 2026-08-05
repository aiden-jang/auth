import { useEffect, type ReactNode } from 'react';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard } from '../components/AuthCard';

/**
 * Central sign-out. Apps redirect here (see auth-client `logoutUrl`) so the session is cleared
 * on the auth origin, then the visitor is sent back to `return_to`. Without this route, a
 * `/logout` link falls through to the catch-all and never actually logs out.
 */
export function LogoutPage(): ReactNode {
  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get('return_to');
    void authApi
      .logout()
      .catch(() => undefined)
      .finally(() => {
        // replace, not href: this page must not stay in history. With a pushed entry, pressing back
        // lands on /logout again, which re-runs the effect and shows "Signing out..." on the way past.
        window.location.replace(safeReturnTo(returnTo) ?? '/login');
      });
  }, []);

  return (
    <AuthCard title="Signing out...">
      <p className="text-sm text-muted">One moment.</p>
    </AuthCard>
  );
}
