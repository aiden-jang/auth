import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard, buttonClass, inputClass } from '../components/AuthCard';
import { Turnstile, turnstileEnabled } from '../components/Turnstile';
import { EmailSuggestion } from '../components/EmailSuggestion';

export function ForgotPasswordPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgot(email, turnstileToken);
    } catch {
      /* always show the same message, no enumeration */
    }
    setSent(true);
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-muted" role="status">
            If an account exists for <span className="text-ink">{email}</span>, a reset link is on its way. The link expires in an hour.
          </p>
          <Link to="/login" className="font-medium text-accent hover:underline">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
          <label htmlFor="reset-email" className="sr-only">Email</label>
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
          <Turnstile onToken={setTurnstileToken} />
          <button className={buttonClass} disabled={loading || (turnstileEnabled && !turnstileToken)}>{loading ? 'Sending...' : 'Send reset link'}</button>
          <p className="text-sm text-muted">
            <Link to="/login" className="text-accent hover:underline">Back to login</Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
