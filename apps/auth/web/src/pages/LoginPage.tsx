import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { safeReturnTo } from '../lib/returnTo';
import { AuthCard, buttonClass, inputClass } from '../components/AuthCard';

export function LoginPage(): ReactNode {
  const [params] = useSearchParams();
  const returnTo = params.get('return_to');
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
      await authApi.login(email, password);
      window.location.href = safeReturnTo(returnTo) ?? '/account';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your aidenjang account.">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
        <input className={inputClass} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input className={inputClass} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm font-medium text-neg">{error}</p>}
        <button className={buttonClass} disabled={loading}>{loading ? 'Signing in...' : 'Log in'}</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to={withReturn('/signup')} className="font-medium text-accent hover:underline">Create account</Link>
        <Link to="/forgot-password" className="text-muted hover:text-ink">Forgot password?</Link>
      </div>
    </AuthCard>
  );
}
