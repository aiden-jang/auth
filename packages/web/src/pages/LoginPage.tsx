import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { EmailSuggestion } from '../components/EmailSuggestion';
import { inboxFor } from '../lib/inbox';
import {
  forgetRecentEmail,
  maskEmail,
  readRecentEmail,
  rememberRecentEmail,
} from '../lib/recentAccount';

const LOGIN_METHOD_KEY = 'aidenjang:login-method';

function preferredMagicMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOGIN_METHOD_KEY) === 'email-link';
  } catch {
    return false;
  }
}

function rememberLoginMethod(magic: boolean): void {
  try {
    window.localStorage.setItem(LOGIN_METHOD_KEY, magic ? 'email-link' : 'password');
  } catch {
    // Preference is optional; authentication itself never depends on local storage.
  }
}

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [recentEmail, setRecentEmail] = useState(readRecentEmail);
  const [email, setEmail] = useState(typeof carriedEmail === 'string' ? carriedEmail : recentEmail ?? '');
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
  const [magicMode, setMagicMode] = useState(preferredMagicMode);
  const [magicSent, setMagicSent] = useState(false);
  const [magicResent, setMagicResent] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn > 0]);

  const withReturn = (p: string) => (returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (magicMode) {
        await authApi.magicLink(email, returnTo, turnstileToken);
        rememberRecentEmail(email);
        setRecentEmail(email.trim().toLowerCase());
        setMagicSent(true);
        setMagicResent(false);
        setResendIn(30);
        // Turnstile tokens are single-use. Prepare a fresh challenge now so a later resend never
        // submits the token that sent the first message.
        setTurnstileToken('');
        setResetSignal((n) => n + 1);
        setLoading(false);
      } else {
        await authApi.login(email, password, turnstileToken);
        rememberRecentEmail(email);
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

  async function resendMagicLink(): Promise<void> {
    if (resendIn > 0 || loading || (turnstileEnabled && !turnstileToken)) return;
    setError(null);
    setLoading(true);
    try {
      await authApi.magicLink(email, returnTo, turnstileToken);
      setMagicResent(true);
      setResendIn(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send another link. Please try again.');
    } finally {
      // Success or failure consumes the challenge server-side, so every retry starts cleanly.
      setTurnstileToken('');
      setResetSignal((n) => n + 1);
      setLoading(false);
    }
  }

  // No subtitle: the brand panel two inches to the left already says "one login for everything I
  // build", and on desktop both are on screen at once. "Welcome back" is complete on its own — the
  // returning user is the one person who does not need the pitch.
  return (
    <AuthCard
      title="Welcome back"
      {...(!returnApp ? { subtitle: 'Sign in to pick up where you left off.' } : {})}
      returnApp={returnApp}
    >
      {magicSent ? (
        <div className="space-y-4">
          <div
            role="status"
            className="rounded-xl border border-pos/30 bg-pos/10 px-4 py-3 text-sm text-pos"
          >
            {magicResent ? (
              <>A fresh sign-in link is on its way to <strong>{email}</strong>.</>
            ) : (
              <>Check your inbox. If <strong>{email}</strong> has an account, a sign-in link is on its way.</>
            )}{' '}
            It expires in 15 minutes.{returnApp ? ` Then we’ll bring you back to ${returnApp.name}.` : ''}
          </div>
          {inboxFor(email) && (
            <a
              href={inboxFor(email)!.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonClass} flex items-center justify-center gap-2 text-center no-underline`}
            >
              {inboxFor(email)!.label} <span aria-hidden>↗</span>
            </a>
          )}
          {resendIn === 0 && <Turnstile onToken={setTurnstileToken} resetSignal={resetSignal} />}
          {error && (
            <p role="alert" className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button
              type="button"
              disabled={resendIn > 0 || loading || (turnstileEnabled && !turnstileToken)}
              onClick={() => void resendMagicLink()}
              className="font-medium text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
            >
              {loading
                ? 'Sending another…'
                : resendIn > 0
                  ? `Send another in ${resendIn}s`
                  : turnstileEnabled && !turnstileToken
                    ? 'Complete the check to resend'
                    : 'Send another link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMagicSent(false);
                setMagicResent(false);
                setError(null);
              }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Change email
            </button>
            <button
              type="button"
              onClick={() => {
                setMagicSent(false);
                setMagicResent(false);
                setMagicMode(false);
                setError(null);
                rememberLoginMethod(false);
              }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Use password instead
            </button>
          </div>
        </div>
      ) : (
        <>
          <GoogleSignIn returnTo={returnTo} />
          <div
            role="tablist"
            aria-label="Sign-in method"
            className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-field p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!magicMode}
              onClick={() => {
                setMagicMode(false);
                rememberLoginMethod(false);
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                !magicMode ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={magicMode}
              onClick={() => {
                setMagicMode(true);
                rememberLoginMethod(true);
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                magicMode ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              Email link
            </button>
          </div>
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
              {recentEmail && email.trim().toLowerCase() === recentEmail && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-line bg-field px-3 py-2 text-xs text-muted">
                  <span>
                    <span className="font-medium text-ink">{maskEmail(recentEmail)}</span>{' '}
                    was last used on this device
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      forgetRecentEmail();
                      setRecentEmail(null);
                      setEmail('');
                    }}
                    className="shrink-0 font-medium text-accent hover:underline"
                  >
                    Forget
                  </button>
                </div>
              )}
            </div>

            {!magicMode && (
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
            )}

            {magicMode && (
              <p className="-mt-1 text-xs leading-relaxed text-muted">
                No password needed. We’ll send a private link that expires in 15 minutes.
              </p>
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
      )}
    </AuthCard>
  );
}
