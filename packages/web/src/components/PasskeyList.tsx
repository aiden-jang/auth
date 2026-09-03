import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { authApi, type Passkey } from '../lib/api';
import { addPasskey, passkeysSupported } from '../lib/passkeys';
import { Skeleton } from './Skeleton';

/* Removal goes through the account page's step-up prompt, so this only has to not swallow a refusal. */

function whenish(iso: string | null): string {
  if (!iso) return 'not used yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'used today';
  if (days === 1) return 'used yesterday';
  if (days < 30) return `used ${days} days ago`;
  return `last used ${new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

export function PasskeyList({
  guard,
}: {
  /** Runs an action through the account page's step-up prompt, so a removal can ask for a password. */
  guard: (label: string, run: () => Promise<void>) => Promise<void>;
}): ReactNode {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPasskeys((await authApi.listPasskeys()).passkeys);
    } catch {
      // A failed list is not worth an alarm on a security page; the retry is a reload.
      setPasskeys([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!passkeysSupported()) return null;

  async function add(): Promise<void> {
    setBusy('add');
    setMessage(null);
    const outcome = await addPasskey();
    setBusy(null);
    if (outcome.kind === 'cancelled') return; // backing out is not a failure
    if (outcome.kind === 'error') {
      setMessage(outcome.message);
      return;
    }
    setMessage(`Added ${outcome.value.label}.`);
    await load();
  }

  async function remove(passkey: Passkey): Promise<void> {
    setBusy(passkey.id);
    setMessage(null);
    try {
      await guard('remove a passkey', async () => {
        await authApi.deletePasskey(passkey.id);
        await load();
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not remove that one.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="passkeys-heading"
      className="rounded-2xl border border-line bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="passkeys-heading" className="font-semibold">
            Passkeys
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your face, fingerprint or screen lock, instead of a password. Nothing we store can be
            used to sign in as you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy === 'add'}
          className="btn-gradient shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy === 'add' ? 'Waiting for your device...' : 'Add a passkey'}
        </button>
      </div>

      {passkeys === null ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : passkeys.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          None yet. Adding one on the device you use most is the single biggest upgrade to this
          account.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-field px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{passkey.label}</p>
                <p className="text-xs text-muted">
                  {whenish(passkey.lastUsedAt)}
                  {' · '}
                  {passkey.backedUp ? (
                    <span className="text-pos">synced, so a lost device keeps it</span>
                  ) : (
                    <span>on this device only</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(passkey)}
                disabled={busy === passkey.id}
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-neg/40 hover:text-neg disabled:opacity-50"
              >
                {busy === passkey.id ? 'Removing...' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-muted">
          {message}
        </p>
      )}
    </section>
  );
}
