import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass } from '../components/AuthCard';

export function LogoutPage(): ReactNode {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ attempt: number; promise: Promise<unknown> } | null>(null);

  useEffect(() => {
    let active = true;
    // StrictMode subscribes twice, but the session mutation must run only once per attempt.
    if (request.current?.attempt !== attempt)
      request.current = { attempt, promise: authApi.logout() };
    void request.current.promise
      .then(() => {
        if (!active) return;
        const returnTo = new URLSearchParams(window.location.search).get('return_to');
        window.location.replace(safeReturnTo(returnTo) ?? '/login');
      })
      .catch(() => {
        if (active) setError('Couldn’t sign you out. Your session may still be active. Try again.');
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <AuthCard title={error ? 'Sign-out didn’t finish' : 'Signing out...'}>
      {error ? (
        <>
          <p role="alert" className="mb-4 text-sm text-neg">
            {error}
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </>
      ) : (
        <p role="status" className="text-sm text-muted">
          One moment.
        </p>
      )}
    </AuthCard>
  );
}
