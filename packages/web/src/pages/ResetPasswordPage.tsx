import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard, buttonClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordStrength } from '../components/PasswordStrength';

export function ResetPasswordPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <p className="text-sm text-muted">
          This reset link is missing its token. Request a new one from the login page.
        </p>
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-accent hover:underline">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Password updated. You've been signed out everywhere for safety.
          </p>
          <Link to="/login" className="font-medium text-accent hover:underline">
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
              onChange={setPassword}
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
              onChange={setConfirmPassword}
              required
              minLength={8}
            />
            {confirmPassword && (
              password !== confirmPassword ? (
                <p className="mt-1 text-xs text-neg">Passwords do not match.</p>
              ) : (
                <p className="mt-1 text-xs text-pos" role="status">Passwords match.</p>
              )
            )}
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
