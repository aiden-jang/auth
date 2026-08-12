import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard } from '../components/AuthCard';

export function VerifyEmailPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <AuthCard title="Verify your email">
      {status === 'pending' && <p className="text-sm text-muted">Confirming your email...</p>}
      {status === 'ok' && (
        <div className="space-y-4">
          <p className="text-sm text-pos">Your email is verified. Nothing else to do.</p>
          <Link to="/account" className="font-medium text-accent hover:underline">Go to your account</Link>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4">
          <p className="text-sm text-neg">That verification link is invalid or expired.</p>
          <Link to="/account" className="font-medium text-accent hover:underline">Go to your account to resend it</Link>
        </div>
      )}
    </AuthCard>
  );
}
