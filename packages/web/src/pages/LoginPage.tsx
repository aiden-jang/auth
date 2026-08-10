import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'google_failed'
      ? 'Google sign-in failed. Please try again.'
      : params.get('error') === 'magic_failed'
        ? 'That sign-in link is invalid or expired. Request a new one.'
        : null,
  );
  const [loading, setLoading] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  // Magic-link mode: sign in via an emailed link instead of a password.
  const [magicMode, setMagicMode] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const withReturn = (p: string) => (returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (magicMode) {
        await authApi.magicLink(email, returnTo, turnstileToken);
        setMagicSent(true);
        setLoading(false);
      } else {
        await authApi.login(email, password, turnstileToken);
        // replace: once signed in, back should not return to the login form.
        window.location.replace(safeReturnTo(returnTo) ?? '/account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
      // The token was consumed server-side; drop it and re-solve so a retry uses a fresh one.
      setTurnstileToken('');
      setResetSignal((n) => n + 1);
    }
  }

  // No subtitle: the brand panel two inches to the left already says "one login for everything I
  // build", and on desktop both are on screen at once. "Welcome back" is complete on its own — the
  // returning user is the one person who does not need the pitch.
  return (
    <AuthCard title="Welcome back" returnApp={returnApp}>
      {magicSent ? (
        <div className="space-y-4">
          <div
            role="status"
            className="rounded-xl border border-pos/30 bg-pos/10 px-4 py-3 text-sm text-pos"
          >
            Check your inbox. If <strong>{email}</strong> has an account, a sign-in link is on its
            way. It expires in 15 minutes.{returnApp ? ` Then we’ll bring you back to ${returnApp.name}.` : ''}
          </div>
          <button
            type="button"
            onClick={() => {
              setMagicSent(false);
              setMagicMode(false);
            }}
            className="text-sm font-medium text-accent hover:underline"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <>
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
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {!magicMode && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-muted">
                    Password
                  </label>
                  <Link
                    to={withReturn('/forgot-password')}
                    className="text-xs text-muted hover:text-ink"
                  >
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
            )}

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
              {loading
                ? magicMode
                  ? 'Sending...'
                  : 'Signing in...'
                : magicMode
                  ? 'Email me a sign-in link'
                  : 'Log in'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMagicMode((m) => !m);
              setError(null);
            }}
            className="mt-4 w-full text-center text-sm text-muted transition hover:text-ink"
          >
            {magicMode ? 'Use a password instead' : 'Email me a sign-in link instead'}
          </button>

          <p className="mt-5 text-center text-sm text-muted">
            New here?{' '}
            <Link to={withReturn('/signup')} className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
