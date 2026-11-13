import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { passkeyUsedOnThisDevice, passkeysLikely, signInWithPasskey } from '../lib/passkeys';
import { safeReturnTo } from '../lib/returnTo';
import { reassurance } from '../lib/reassurance';
import { WebAuthnAbortService } from '@simplewebauthn/browser';
import { AccountIcon } from './AccountIcon';

/*
 * Offered only where a passkey has been used, not merely where one could exist -- otherwise this
 * asks people who have none for a security key. Everyone else gets it from the email field instead.
 *
 * Cancelling shows no error: cancel, no-match and timeout are reported identically.
 */
export function PasskeySignIn({ returnTo }: { returnTo?: string | null }): ReactNode {
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(
    () => () => {
      if (pending.current) {
        pending.current.abort();
        WebAuthnAbortService.cancelCeremony();
      }
    },
    [],
  );

  useEffect(() => {
    let live = true;
    if (!passkeyUsedOnThisDevice()) return;
    void passkeysLikely().then((yes) => {
      if (live) setOffer(yes);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!offer) return null;

  async function go(): Promise<void> {
    if (pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError(null);
    const outcome = await signInWithPasskey({ signal: request.signal });
    if (request.signal.aborted) return;
    if (outcome.kind === 'ok') {
      // replace, not assign: back should not return to the sign-in form once you are through it.
      window.location.replace(safeReturnTo(returnTo ?? null) ?? '/account');
      return;
    }
    pending.current = null;
    setBusy(false);
    if (outcome.kind === 'error') setError(outcome.message);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="btn-primary flex w-full items-center justify-center gap-2 rounded-[9px] px-4 py-3 text-sm font-medium transition disabled:opacity-60"
      >
        <AccountIcon kind="key" />
        {busy ? 'Waiting for your device...' : 'Sign in with a passkey'}
      </button>
      <p role={busy ? 'status' : undefined} className="mt-2 text-center text-xs text-muted">
        {busy
          ? reassurance('passkey')
          : 'No password to type or remember. Your device confirms it is you.'}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-neg">
          {error}
        </p>
      )}
    </div>
  );
}
