import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const returnTo = params.get('return_to');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'google_failed' ? 'Google sign-in failed. Please try again.' : null,
  );
  const [loading, setLoading] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const withReturn = (p: string) => (returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.login(email, password, turnstileToken);
      window.location.href = safeReturnTo(returnTo) ?? '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setLoading(false);
      // The token was consumed server-side; drop it and re-solve so a retry uses a fresh one.
      setTurnstileToken('');
      setResetSignal((n) => n + 1);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="One login for all of aidenjang's apps.">
      <GoogleSignIn returnTo={returnTo} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            className={inputClass}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium text-muted">
              Password
            </label>
            <Link to={withReturn('/forgot-password')} className="text-xs text-muted hover:text-ink">
              Forgot?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg"
          >
            {error}
          </p>
        )}

        <Turnstile onToken={setTurnstileToken} resetSignal={resetSignal} />

        <button className={buttonClass} disabled={loading || (turnstileEnabled && !turnstileToken)}>
          {loading ? 'Signing in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        New here?{' '}
        <Link to={withReturn('/signup')} className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
