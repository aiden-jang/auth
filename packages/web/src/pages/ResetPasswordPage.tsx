import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { ApiError, authApi } from '../lib/api';
import { AuthCard, buttonClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordStrength } from '../components/PasswordStrength';
import { announceSessionChange } from '../lib/sessionChanges';

export function ResetPasswordPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  const returnTo = safeReturnTo(params.get('return_to'));
  const returnApp = returnAppFor(returnTo);
  const withReturn = (path: string): string =>
    returnTo ? `${path}?return_to=${encodeURIComponent(returnTo)}` : path;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const freshLink = useRef<HTMLAnchorElement>(null);
  useLayoutEffect(() => {
    if (invalidLink) freshLink.current?.focus();
  }, [invalidLink]);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token || loading || invalidLink) return;
    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.reset(token, password);
      announceSessionChange();
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') {
        setInvalidLink(true);
        setPassword('');
        setConfirmPassword('');
      }
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
      setLoading(false);
    }
  }

  if (!token || invalidLink) {
    return (
      <AuthCard title="Reset your password" returnApp={returnApp}>
        <p
          role={invalidLink ? 'alert' : undefined}
          className={invalidLink ? 'text-sm text-neg' : 'text-sm text-muted'}
        >
          {invalidLink ? error : 'This reset link is incomplete. Request a fresh link below.'}
        </p>
        <Link
          ref={freshLink}
          to={withReturn('/forgot-password')}
          className={`${buttonClass} mt-4 block text-center no-underline`}
        >
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" returnApp={returnApp}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted" role="status">
            Password updated. You've been signed out everywhere for safety.
          </p>
          <Link to={withReturn('/login')} className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="password" className={labelClass}>
              New password
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="8+ characters"
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (!invalidLink) setError(null);
              }}
              required
              minLength={8}
              autoFocus
            />
            <PasswordStrength value={password} />
          </div>

          <div>
            <label htmlFor="confirm-password" className={labelClass}>
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-password"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                if (!invalidLink) setError(null);
              }}
              required
              minLength={8}
            />
            {confirmPassword &&
              (password !== confirmPassword ? (
                <p className="mt-1 text-xs text-neg">Passwords do not match.</p>
              ) : (
                <p className="mt-1 text-xs text-pos" role="status">
                  Passwords match.
                </p>
              ))}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg"
            >
              {error}
            </p>
          )}

          <button className={buttonClass} disabled={loading}>
            {loading ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
