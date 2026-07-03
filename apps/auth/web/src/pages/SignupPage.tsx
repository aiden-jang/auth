import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass } from '../components/AuthCard';

export function SignupPage(): ReactNode {
  const [params] = useSearchParams();
  const returnTo = params.get('return_to');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const withReturn = (p: string) => (returnTo ? `${p}?return_to=${encodeURIComponent(returnTo)}` : p);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register(email, password, displayName);
      window.location.href = safeReturnTo(returnTo) ?? '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="One account for all of aidenjang's apps.">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
        <input className={inputClass} placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoFocus />
        <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={inputClass} type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <p className="text-sm font-medium text-neg">{error}</p>}
        <button className={buttonClass} disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have one?{' '}
        <Link to={withReturn('/login')} className="font-medium text-accent hover:underline">Log in</Link>
      </p>
    </AuthCard>
  );
}
