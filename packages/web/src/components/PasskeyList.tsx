import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi, type Passkey } from '../lib/api';
import { addPasskey, passkeysSupported } from '../lib/passkeys';
import { Skeleton } from './Skeleton';

/* Removal goes through the account page's step-up prompt, so this only has to not swallow a refusal. */

export function PasskeyList({
  guard,
}: {
  /** Runs an action through the account page's step-up prompt, so a removal can ask for a password. */
  guard: (label: string, run: () => Promise<void>) => Promise<boolean>;
}): ReactNode {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const id = ++latestLoad.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await authApi.listPasskeys();
      if (mounted.current && id === latestLoad.current) setPasskeys(result.passkeys);
    } catch {
      if (mounted.current && id === latestLoad.current)
        setLoadError('Couldn’t load your passkeys. Try again.');
    } finally {
      if (mounted.current && id === latestLoad.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Fetch on mount; loading and errors also belong to an explicit retry.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (passkeysSupported()) void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  if (!passkeysSupported()) return null;

  async function add(): Promise<void> {
    if (busy) return;
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
    if (busy) return;
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
          disabled={busy !== null}
          className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy === 'add' ? 'Waiting for your device...' : 'Add a passkey'}
        </button>
      </div>

      {passkeys === null && loading ? (
        <div className="mt-4 space-y-2" role="status" aria-label="Loading passkeys">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : passkeys?.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          No passkeys yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {passkeys?.map((passkey) => (
            <li
              key={passkey.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-field px-4 py-3"
            >
              <div className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
                <p className="font-medium">{passkey.label}</p>
                <p className="mt-1 text-xs text-muted">
                  {passkey.lastUsedAt ? (
                    <>
                      Last used:{' '}
                      <time dateTime={passkey.lastUsedAt}>
                        {new Date(passkey.lastUsedAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </>
                  ) : (
                    'Not used yet'
                  )}
                </p>
                <p className="text-xs text-muted">
                  {passkey.backedUp ? <span className="text-pos">Backed up</span> : 'Not backed up'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(passkey)}
                disabled={busy !== null}
                className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-neg/40 hover:text-neg disabled:opacity-50"
              >
                {busy === passkey.id ? 'Removing...' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadError && (
        <div className="mt-3">
          <p role="alert" className="text-sm text-neg">
            {loadError}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="mt-2 min-h-11 text-sm font-medium text-accent"
          >
            {loading ? 'Loading…' : 'Try again'}
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-muted">
          {message}
        </p>
      )}
    </section>
  );
}
