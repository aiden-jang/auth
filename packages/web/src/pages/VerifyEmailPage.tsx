import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard } from '../components/AuthCard';
import { reassurance } from '../lib/reassurance';

export function VerifyEmailPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  // A link with no token is already an error, so say so on the first render rather than flashing
  // "Confirming your email..." at somebody whose link was truncated.
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error');

  /*
   * A verification token is spent on first use, so this may only ever send it once.
   *
   * Without the guard the effect running twice -- StrictMode in development, a remount, a fast
   * refresh -- sends it twice: the first call verifies the address and the second is refused
   * because the token is now gone, and whichever settles last decides what the page says. The
   * person is left reading "invalid or expired" about a link that just worked.
   */
  const spent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || spent.current === token) return;
    spent.current = token;
    authApi
      .verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <AuthCard title="Verify your email">
      {status === 'pending' && (
        <div className="space-y-1">
          <p className="text-sm text-muted">Confirming your email...</p>
          <p role="status" className="text-xs text-muted">
            {reassurance('verify-email')}
          </p>
        </div>
      )}
      {status === 'ok' && (
        <div className="space-y-4">
          <p className="text-sm text-pos">Your email is verified. Nothing else to do.</p>
          <Link to="/account" className="font-medium text-accent hover:underline">
            Go to your account
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-neg">That verification link is invalid or expired.</p>
          <Link to="/account" className="font-medium text-accent hover:underline">
            Go to your account to resend it
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
