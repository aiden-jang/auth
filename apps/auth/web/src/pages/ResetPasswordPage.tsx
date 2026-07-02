import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { AuthCard, buttonClass, inputClass } from '../components/AuthCard';

export function ResetPasswordPage(): ReactNode {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <p className="text-sm text-muted">This reset link is missing its token. Request a new one from the login page.</p>
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-accent hover:underline">Request a new link</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Password updated. You've been signed out everywhere for safety.</p>
          <Link to="/login" className="font-medium text-accent hover:underline">Log in</Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5">
          <input className={inputClass} type="password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
          {error && <p className="text-sm font-medium text-neg">{error}</p>}
          <button className={buttonClass} disabled={loading}>{loading ? 'Saving...' : 'Set new password'}</button>
        </form>
      )}
    </AuthCard>
  );
}
