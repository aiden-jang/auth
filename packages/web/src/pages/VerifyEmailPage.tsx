import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { authApi } from '../lib/api';
import { AuthCard } from '../components/AuthCard';
import { reassurance } from '../lib/reassurance';

export function VerifyEmailPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  const returnTo = safeReturnTo(params.get('return_to'));
  const returnApp = returnAppFor(returnTo);
  // A link with no token is already an error, so say so on the first render rather than flashing
  // "Confirming your email..." at somebody whose link was truncated.
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error');

  /* The token is spent on first use, so send it once. An effect that runs twice verifies the
     address and is then refused, and whichever settles last decides what the page says. */
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
    <AuthCard title="Verify your email" returnApp={returnApp}>
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
          {returnTo && returnApp ? (
            <a href={returnTo} className="font-medium text-accent hover:underline">
              Continue to {returnApp.name}
            </a>
          ) : (
            <Link to="/account" className="font-medium text-accent hover:underline">
              Go to your account
            </Link>
          )}
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
