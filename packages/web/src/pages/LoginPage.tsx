import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { WebAuthnAbortService } from '@simplewebauthn/browser';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { useTurnstile } from '../lib/useTurnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { PasskeySignIn } from '../components/PasskeySignIn';
import { RecentAccounts } from '../components/RecentAccounts';
import { passkeyAutofillAvailable, signInWithPasskey } from '../lib/passkeys';
import { reassurance } from '../lib/reassurance';
import { welcomeLine } from '../lib/welcome';
import { EmailSuggestion } from '../components/EmailSuggestion';
import {
  forgetRecentAccount,
  maskEmail,
  readRecentAccounts,
  rememberRecentAccount,
} from '../lib/recentAccount';

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [recentAccounts, setRecentAccounts] = useState(readRecentAccounts);
  const [step, setStep] = useState<'choose' | 'methods' | 'email'>(() =>
    typeof carriedEmail === 'string' || recentAccounts.length === 0 ? 'email' : 'choose',
  );
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) document.querySelector<HTMLElement>('main h1')?.focus();
    previousStep.current = step;
  }, [step]);
  const [greeting] = useState(() => welcomeLine(readRecentAccounts()));
  const recentEmail = recentAccounts[0]?.email ?? null;
  const [email, setEmail] = useState(
    typeof carriedEmail === 'string' ? carriedEmail : (recentEmail ?? ''),
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'google_failed'
      ? params.get('reason') === 'provider_access_denied'
        ? 'Google sign-in was canceled. Try again or use another sign-in method.'
        : 'Google sign-in failed. Please try again.'
      : null,
  );
  const [loading, setLoading] = useState(false);
  const turnstile = useTurnstile();
  const loginRequest = useRef<AbortController | null>(null);
  useLayoutEffect(
    () => () => {
      loginRequest.current?.abort();
      WebAuthnAbortService.cancelCeremony();
    },
    [],
  );

  /* Silent: a browser holding no passkey for this origin shows nothing, which is the difference
     between being offered your own key and being asked for a security key you do not own. */
  useEffect(() => {
    const abort = new AbortController();
    void passkeyAutofillAvailable().then((available) => {
      if (!available || abort.signal.aborted) return;
      void signInWithPasskey({ autofill: true, signal: abort.signal }).then((outcome) => {
        if (outcome.kind !== 'ok' || abort.signal.aborted) return;
        window.location.replace(safeReturnTo(returnTo) ?? '/account');
      });
    });
    return () => abort.abort();
  }, [returnTo]);

  const withReturn = (p: string) =>
    returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p;

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (loginRequest.current) return;
    const request = new AbortController();
    loginRequest.current = request;
    setError(null);
    setLoading(true);
    try {
      await authApi.login(email, password, turnstile.token, request.signal);
      if (request.signal.aborted) return;
      rememberRecentAccount(email);
      // replace: once signed in, back should not return to the login form.
      window.location.replace(safeReturnTo(returnTo) ?? '/account');
    } catch (err) {
      if (request.signal.aborted) return;
      loginRequest.current = null;
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
      turnstile.discard();
    }
  }

  const passwordForm = (
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
          autoComplete="email webauthn"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          required
          autoFocus={step === 'email'}
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
            Forgot password?
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

      <Turnstile onToken={turnstile.setToken} resetSignal={turnstile.resetSignal} />

      <button className={buttonClass} disabled={loading || (turnstileEnabled && !turnstile.token)}>
        {loading ? 'Signing in…' : 'Log in'}
      </button>
      {loading && (
        <p role="status" className="text-center text-xs text-muted">
          {reassurance('password-login')}
        </p>
      )}
    </form>
  );

  const chooseAnotherAccount = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setStep('email');
  };
  const heading =
    step === 'choose'
      ? 'Choose your account'
      : step === 'methods'
        ? 'Welcome back'
        : returnApp
          ? `Continue to ${returnApp.name}`
          : 'Sign in';
  const footer =
    step === 'choose' || step === 'methods' ? (
      <button type="button" disabled={loading} onClick={chooseAnotherAccount}>
        Use another account
      </button>
    ) : (
      <p>
        New here?{' '}
        <Link to={withReturn('/signup')} state={{ email }}>
          Create an account
        </Link>
      </p>
    );

  return (
    <AuthCard
      title={heading}
      subtitle={
        step === 'choose'
          ? 'Remembered only on this device.'
          : returnApp
            ? 'Sign in with your aidenjang account.'
            : greeting
      }
      returnApp={returnApp}
      header={
        <Link to={withReturn('/signup')} state={{ email }}>
          Create an account
        </Link>
      }
      footer={footer}
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg"
        >
          {error}
        </p>
      )}
      {step === 'choose' ? (
        <RecentAccounts
          accounts={recentAccounts}
          onChoose={(chosen) => {
            setEmail(chosen);
            setPassword('');
            setError(null);
            setStep('methods');
          }}
          onForget={(forgotten) => {
            forgetRecentAccount(forgotten);
            const next = readRecentAccounts();
            setRecentAccounts(next);
            if (!next.length) chooseAnotherAccount();
          }}
        />
      ) : step === 'methods' ? (
        <>
          <div className="chosen-account">
            <span className="account-avatar" aria-hidden>
              {email.slice(0, 2)}
            </span>
            <strong>{maskEmail(email)}</strong>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setPassword('');
                setError(null);
                setStep('choose');
              }}
            >
              Change
            </button>
          </div>
          <PasskeySignIn returnTo={returnTo} />
          <GoogleSignIn returnTo={returnTo} divider={false} />
          <details className="password-option">
            <summary>Use your password</summary>
            {passwordForm}
          </details>
        </>
      ) : (
        <>
          <PasskeySignIn returnTo={returnTo} />
          <GoogleSignIn returnTo={returnTo} />
          {passwordForm}
        </>
      )}
    </AuthCard>
  );
}
