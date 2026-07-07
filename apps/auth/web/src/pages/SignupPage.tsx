import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';

export function SignupPage(): ReactNode {
  const [params] = useSearchParams();
  const returnTo = params.get('return_to');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const withReturn = (p: string) => (returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p);

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
      await authApi.register(email, password, displayName, turnstileToken);
      window.location.href = safeReturnTo(returnTo) ?? '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="One account for all of aidenjang's apps.">
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
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            placeholder="you@example.com"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            required
          />
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
            onChange={setPassword}
            required
            minLength={8}
          />
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
            onChange={setConfirmPassword}
            required
            minLength={8}
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

        <Turnstile onToken={setTurnstileToken} />

        <button className={buttonClass} disabled={loading || (turnstileEnabled && !turnstileToken)}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have one?{' '}
        <Link to={withReturn('/login')} className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
