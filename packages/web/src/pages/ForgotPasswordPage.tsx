import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard, buttonClass, inputClass } from '../components/AuthCard';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { EmailSuggestion } from '../components/EmailSuggestion';
import { returnAppFor } from '../lib/returnTo';
import { inboxFor } from '../lib/inbox';
import { reassurance } from '../lib/reassurance';

export function ForgotPasswordPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [email, setEmail] = useState(typeof carriedEmail === 'string' ? carriedEmail : '');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  /* Keyed on whether it is counting, not on the count: depending on `resendIn` itself would tear
     down and rebuild the interval every single second. */
  const counting = resendIn > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(
      () => setResendIn((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [counting]);

  async function requestReset(): Promise<boolean> {
    setError(null);
    try {
      await authApi.forgot(email, turnstileToken, returnTo);
      return true;
    } catch (err) {
      // The server answers identically for known and unknown accounts; transport failures need a retry.
      setError(err instanceof Error ? err.message : 'Could not request a reset link. Try again.');
      return false;
    } finally {
      setTurnstileToken('');
      setResetSignal((signal) => signal + 1);
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    if (!(await requestReset())) return;
    setSent(true);
    setResent(false);
    setResendIn(30);
  }

  async function resend(): Promise<void> {
    if (loading || resendIn > 0 || (turnstileEnabled && !turnstileToken)) return;
    setLoading(true);
    if (!(await requestReset())) return;
    setResent(true);
    setResendIn(30);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      returnApp={returnApp}
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-neg/30 bg-neg/10 p-3 text-sm text-neg"
        >
          {error}
        </p>
      )}
      {sent ? (
        <div className="space-y-4">
          <p
            className="rounded-xl border border-pos/30 bg-pos/10 px-4 py-3 text-sm text-pos"
            role="status"
          >
            {resent ? 'A fresh reset link is on its way. ' : ''}
            If an account exists for <span className="font-medium">{email}</span>, check that inbox.
            The link expires in an hour.
          </p>
          {inboxFor(email) && (
            <a
              href={inboxFor(email)!.href}
              target="_blank"
              aria-describedby="external-link-hint"
              rel="noopener noreferrer"
              className={`${buttonClass} flex items-center justify-center gap-2 text-center no-underline`}
            >
              {inboxFor(email)!.label} <span aria-hidden>↗</span>
            </a>
          )}
          {resendIn === 0 && <Turnstile onToken={setTurnstileToken} resetSignal={resetSignal} />}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={loading || resendIn > 0 || (turnstileEnabled && !turnstileToken)}
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
                setSent(false);
                setResent(false);
              }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Change email
            </button>
            <Link
              to={returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'}
              state={{ email }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
          <label htmlFor="reset-email" className="sr-only">
            Email
          </label>
          <input
            id="reset-email"
            name="email"
            className={inputClass}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            autoFocus
          />
          <EmailSuggestion value={email} onAccept={setEmail} />
          <Turnstile onToken={setTurnstileToken} resetSignal={resetSignal} />
          <button
            className={buttonClass}
            disabled={loading || (turnstileEnabled && !turnstileToken)}
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
          {loading && (
            <p role="status" className="text-center text-xs text-muted">
              {reassurance('reset-link')}
            </p>
          )}
          <p className="text-sm text-muted">
            <Link
              to={returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'}
              state={{ email }}
              className="text-accent hover:underline"
            >
              Back to login
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
