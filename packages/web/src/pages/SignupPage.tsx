import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { returnAppFor, safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordStrength } from '../components/PasswordStrength';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { EmailSuggestion } from '../components/EmailSuggestion';
import { reassurance } from '../lib/reassurance';

export function SignupPage(): ReactNode {
  const [params] = useSearchParams();
  const location = useLocation();
  const returnTo = params.get('return_to');
  const returnApp = returnAppFor(returnTo);
  const carriedEmail = (location.state as { email?: unknown } | null)?.email;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(typeof carriedEmail === 'string' ? carriedEmail : '');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const withReturn = (p: string) =>
    returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p;

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    // Confirm the two emails match before hitting the server, so a typo in
    // the address they will need for verification and password resets gets
    // caught here. Compared trimmed + lowercased, the same way the backend
    // normalizes email.
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError('Those emails do not match. Check for a typo.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.register(email, password, displayName, turnstileToken, returnTo);
      // replace: back should not return to a signup form for an account that now exists.
      window.location.replace(safeReturnTo(returnTo) ?? '/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setLoading(false);
      // The token was consumed server-side; drop it and re-solve so a retry uses a fresh one.
      setTurnstileToken('');
      setResetSignal((n) => n + 1);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle={
        returnApp
          ? 'Create your account, then head straight back.'
          : "One account for all of aidenjang's apps."
      }
      returnApp={returnApp}
    >
      <GoogleSignIn returnTo={returnTo} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input
            id="name"
            name="name"
            className={inputClass}
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setError(null);
            }}
            required
            autoFocus
            maxLength={80}
          />
        </div>

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
          />
          <EmailSuggestion
            value={email}
            onAccept={(value) => {
              // If the confirmation already mirrored the typo, correct both fields together so a
              // helpful fix does not immediately turn into a confusing mismatch warning.
              setConfirmEmail((current) =>
                current.trim().toLowerCase() === email.trim().toLowerCase() ? value : current,
              );
              setEmail(value);
              setError(null);
            }}
          />
        </div>

        <div>
          <label htmlFor="confirm-email" className={labelClass}>
            Confirm email
          </label>
          <input
            id="confirm-email"
            name="confirm-email"
            className={inputClass}
            type="email"
            autoComplete="off"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="you@example.com"
            value={confirmEmail}
            onChange={(e) => {
              setConfirmEmail(e.target.value);
              setError(null);
            }}
            required
          />
          {confirmEmail && email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase() && (
            <p className="mt-1 text-xs text-neg">Emails do not match.</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="8+ characters"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(null);
            }}
            required
            minLength={8}
          />
          <PasswordStrength value={password} />
        </div>

        <div>
          <label htmlFor="confirm-password" className={labelClass}>
            Confirm password
          </label>
          <PasswordInput
            id="confirm-password"
            name="confirm-password"
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setError(null);
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

        <Turnstile onToken={setTurnstileToken} resetSignal={resetSignal} />

        <button className={buttonClass} disabled={loading || (turnstileEnabled && !turnstileToken)}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
        {loading && (
          <p role="status" className="text-center text-xs text-muted">
            {reassurance('signup')}
          </p>
        )}
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          to={withReturn('/login')}
          state={{ email }}
          className="font-medium text-accent hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
