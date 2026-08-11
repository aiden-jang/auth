import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { EmailSuggestion } from '../components/EmailSuggestion';

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

function inboxFor(email: string): { label: string; href: string } | null {
  const domain = email.trim().split('@').pop()?.toLowerCase();
  if (!domain) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { label: 'Open Gmail', href: 'https://mail.google.com/' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { label: 'Open Outlook', href: 'https://outlook.live.com/mail/' };
  }
  if (domain === 'yahoo.com') return { label: 'Open Yahoo Mail', href: 'https://mail.yahoo.com/' };
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return { label: 'Open iCloud Mail', href: 'https://www.icloud.com/mail/' };
  }
  return null;
}

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [email, setEmail] = useState(typeof carriedEmail === 'string' ? carriedEmail : '');
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
        setMagicSent(true);
        setResendIn(30);
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
            Check your inbox. If <strong>{email}</strong> has an account, a sign-in link is on its
            way. It expires in 15 minutes.{returnApp ? ` Then we’ll bring you back to ${returnApp.name}.` : ''}
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
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button
              type="button"
              disabled={resendIn > 0}
              onClick={() => {
                setMagicSent(false);
                setMagicMode(true);
                setTurnstileToken('');
                setResetSignal((n) => n + 1);
              }}
              className="font-medium text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
            >
              {resendIn > 0 ? `Send another in ${resendIn}s` : 'Send another link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMagicSent(false);
                setMagicMode(false);
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
