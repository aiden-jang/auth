import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { PasskeySignIn } from '../components/PasskeySignIn';
import { reassurance } from '../lib/reassurance';
import { welcomeLine } from '../lib/welcome';
import { EmailSuggestion } from '../components/EmailSuggestion';
import {
  forgetRecentAccount,
  maskEmail,
  readRecentAccounts,
  recentAccountTimeLabel,
  rememberRecentAccount,
} from '../lib/recentAccount';

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [recentAccounts, setRecentAccounts] = useState(readRecentAccounts);
  const [greeting] = useState(() => welcomeLine(readRecentAccounts()));
  const recentEmail = recentAccounts[0]?.email ?? null;
  const [email, setEmail] = useState(typeof carriedEmail === 'string' ? carriedEmail : recentEmail ?? '');
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
      rememberRecentAccount(email);
      // replace: once signed in, back should not return to the login form.
      window.location.replace(safeReturnTo(returnTo) ?? '/account');
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
    <AuthCard
      title="Welcome back"
      {...(!returnApp ? { subtitle: greeting } : {})}
      returnApp={returnApp}
    >
      <>
          {/* Above Google and the form: nothing to type, and nothing on our side worth stealing. */}
          <PasskeySignIn returnTo={returnTo} />
          <GoogleSignIn returnTo={returnTo} />
          {recentAccounts.length > 0 && (
            <section aria-labelledby="recent-accounts-heading" className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="recent-accounts-heading" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Recent on this device
                </h2>
                <span className="text-[10px] text-muted">stored only here</span>
              </div>
              <ul className="space-y-1.5">
                {recentAccounts.map((account) => {
                  const selected = email.trim().toLowerCase() === account.email;
                  return (
                    <li
                      key={account.email}
                      className={`flex items-center gap-2 rounded-xl border p-1.5 transition ${
                        selected ? 'border-accent/35 bg-accent/10' : 'border-line bg-field'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(account.email);
                          setPassword('');
                          setError(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left"
                        aria-label={`Continue as ${account.email}`}
                      >
                        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold uppercase text-accent">
                          {account.email.split('@')[0]?.slice(0, 2) || '?'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-semibold text-ink">{maskEmail(account.email)}</strong>
                          <small className="block text-[10px] text-muted">
                            {recentAccountTimeLabel(account.lastUsedAt)}
                          </small>
                        </span>
                        <span aria-hidden className={`text-sm ${selected ? 'text-accent' : 'text-muted'}`}>{selected ? '✓' : '→'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          forgetRecentAccount(account.email);
                          const next = readRecentAccounts();
                          setRecentAccounts(next);
                          if (selected) setEmail(next[0]?.email ?? '');
                        }}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-card hover:text-ink"
                        aria-label={`Forget ${account.email} on this device`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setEmail('');
                  setPassword('');
                  setError(null);
                  window.setTimeout(() => document.getElementById('email')?.focus(), 0);
                }}
                className="mt-2 text-xs font-medium text-accent hover:underline"
              >
                Use another account
              </button>
            </section>
          )}
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                required
                autoFocus
              />
              <EmailSuggestion
                value={email}
                onAccept={(value) => {
                  setEmail(value);
                  setError(null);
                }}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-muted">
                    Password
                  </label>
                  <Link
                    to={withReturn('/forgot-password')}
                    state={{ email }}
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
                  onChange={(value) => {
                    setPassword(value);
                    setError(null);
                  }}
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
            {loading && (
              <p role="status" className="text-center text-xs text-muted">
                {reassurance('password-login')}
              </p>
            )}
          </form>

          <p className="mt-5 text-center text-sm text-muted">
              First time here?{' '}
            <Link
              to={withReturn('/signup')}
              state={{ email }}
              className="font-medium text-accent hover:underline"
            >
              Create an account
            </Link>
          </p>
      </>
    </AuthCard>
  );
}
