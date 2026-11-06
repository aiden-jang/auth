import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (sentTo) confirmation.current?.focus();
  }, [sentTo]);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const inbox = sentTo ? inboxFor(sentTo) : null;
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

  async function requestReset(address: string): Promise<boolean> {
    setError(null);
    try {
      await authApi.forgot(address, turnstileToken, returnTo);
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
    if (loading) return;
    const address = email.trim();
    setLoading(true);
    if (!(await requestReset(address))) return;
    setSentTo(address);
    setResent(false);
    setResendIn(30);
  }

  async function resend(): Promise<void> {
    if (!sentTo || loading || resendIn > 0 || (turnstileEnabled && !turnstileToken)) return;
    setLoading(true);
    if (!(await requestReset(sentTo))) return;
    setResent(true);
    setResendIn(30);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      returnApp={returnApp}
      artwork="mail"
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-neg/30 bg-neg/10 p-3 text-sm text-neg"
        >
          {error}
        </p>
      )}
      {sentTo ? (
        <div className="space-y-4">
          <p
            ref={confirmation}
            tabIndex={-1}
            className="rounded-xl border border-pos/30 bg-pos/10 px-4 py-3 text-sm text-pos"
            role="status"
          >
            {resent ? 'Another reset link was requested. ' : ''}
            If an account exists for <span className="font-medium">{sentTo}</span>, check that
            inbox. The link expires in an hour.
          </p>
          {inbox && (
            <a
              href={inbox.href}
              target="_blank"
              aria-describedby="external-link-hint"
              rel="noopener noreferrer"
              className={`${buttonClass} flex items-center justify-center gap-2 text-center no-underline`}
            >
              {inbox.label} <span aria-hidden>↗</span>
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
              disabled={loading}
              onClick={() => {
                setSentTo(null);
                setResent(false);
              }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Change email
            </button>
            <Link
              to={returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'}
              state={{ email: sentTo }}
              className="font-medium text-muted hover:text-ink hover:underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
          <div>
            <label htmlFor="reset-email" className={labelClass}>
              Email
            </label>
            <input
              id="reset-email"
              name="email"
              className={inputClass}
              type="email"
              placeholder="Email"
              value={email}
              readOnly={loading}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              autoFocus
            />
          </div>
          {!loading && <EmailSuggestion value={email} onAccept={setEmail} />}
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
