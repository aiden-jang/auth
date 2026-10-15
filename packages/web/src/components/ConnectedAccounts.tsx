import { useState, type ReactNode } from 'react';
import { authApi, googleConnectUrl, type AuthUser } from '../lib/api';

/* Unlinking goes behind the step-up prompt; it is half the chain described in auth/stepUp.ts. */
export function ConnectedAccounts({
  user,
  googleMsg,
  setGoogleMsg,
  guard,
  onDisconnected,
}: {
  user: AuthUser;
  /* Owned by the page: the Google callback redirects back with ?error, which is read on the first
     render before this component is anywhere near it. */
  googleMsg: string | null;
  setGoogleMsg: (message: string | null) => void;
  guard: (label: string, run: () => Promise<void>) => Promise<boolean>;
  onDisconnected: () => void;
}): ReactNode {
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnectGoogle(): Promise<void> {
    setDisconnecting(true);
    setGoogleMsg(null);
    try {
      await guard('unlink Google', async () => {
        await authApi.disconnectGoogle();
        onDisconnected();
      });
    } catch (err) {
      setGoogleMsg(err instanceof Error ? err.message : 'Could not disconnect Google.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section aria-label="Connected accounts">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Connected accounts</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-field px-4 py-3">
        <span className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          <span>
            <span className="block text-sm font-medium text-ink">Google</span>
            <span className="block text-xs text-muted">
              {user.hasGoogle ? 'Connected' : 'Not connected'}
            </span>
          </span>
        </span>
        {user.hasGoogle ? (
          user.hasPassword ? (
            <button
              type="button"
              onClick={() => void disconnectGoogle()}
              disabled={disconnecting}
              className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-60"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <span className="shrink-0 text-xs text-muted">Set a password to disconnect</span>
          )
        ) : (
          <a
            href={googleConnectUrl('/account')}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-accent transition hover:border-accent"
          >
            Connect
          </a>
        )}
      </div>
      {googleMsg && (
        <p role="alert" className="mt-2 text-sm font-medium text-neg">
          {googleMsg}
        </p>
      )}
    </section>
  );
}
