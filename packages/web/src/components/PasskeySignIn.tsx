import { useEffect, useState, type ReactNode } from 'react';
import { passkeysLikely, signInWithPasskey } from '../lib/passkeys';
import { safeReturnTo } from '../lib/returnTo';

/*
 * Hides itself when the platform has no authenticator, rather than offering a dead end as the primary
 * action. Cancelling shows nothing: WebAuthn reports cancel, no-matching-key and timeout as the same
 * error so a site cannot probe which credentials exist, so we genuinely cannot tell them apart.
 */
export function PasskeySignIn({ returnTo }: { returnTo?: string | null }): ReactNode {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void passkeysLikely().then((yes) => {
      if (live) setOffer(yes);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!offer) return null;

  async function go(): Promise<void> {
    setBusy(true);
    setError(null);
    const outcome = await signInWithPasskey();
    if (outcome.kind === 'ok') {
      // replace, not assign: back should not return to the sign-in form once you are through it.
      window.location.replace(safeReturnTo(returnTo ?? null) ?? '/account');
      return;
    }
    setBusy(false);
    if (outcome.kind === 'error') setError(outcome.message);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="btn-gradient flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
      >
        <span aria-hidden>⚿</span>
        {busy ? 'Waiting for your device...' : 'Sign in with a passkey'}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        No password to type or remember. Your device confirms it is you.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-neg">
          {error}
        </p>
      )}
    </div>
  );
}
