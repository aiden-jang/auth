import { useEffect, useState, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../lib/api';
import { AuthCard, buttonClass } from '../components/AuthCard';

export function AccountPage(): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    authApi
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout(): Promise<void> {
    await authApi.logout().catch(() => undefined);
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <AuthCard title="Your account">
        <p className="text-sm text-muted">Loading...</p>
      </AuthCard>
    );
  }
  if (!user) return null;

  return (
    <AuthCard title="Your account" subtitle="One login for all of aidenjang's apps.">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Name</dt>
          <dd className="font-medium">{user.displayName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email status</dt>
          <dd>
            {user.emailVerified ? (
              <span className="rounded-full border border-pos/30 bg-pos/10 px-2.5 py-0.5 text-xs font-medium text-pos">verified</span>
            ) : (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">unverified</span>
            )}
          </dd>
        </div>
      </dl>

      {!user.emailVerified && (
        <button
          type="button"
          onClick={() => void authApi.resendVerification().then(() => setResent(true))}
          className="mt-4 text-sm font-medium text-accent hover:underline"
        >
          {resent ? 'Verification email sent' : 'Resend verification email'}
        </button>
      )}

      <button type="button" onClick={() => void logout()} className={`${buttonClass} mt-6`}>
        Log out
      </button>

      <nav className="mt-6 flex justify-center gap-5 text-xs text-muted">
        <a href="/privacy" className="hover:text-accent hover:underline">
          Privacy
        </a>
        <a href="/terms" className="hover:text-accent hover:underline">
          Terms
        </a>
      </nav>
    </AuthCard>
  );
}
