import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authApi, isReauthRequired, reauthCanUsePassword } from '../lib/api';
import { PasswordInput } from './PasswordInput';
import { reassurance } from '../lib/reassurance';

/*
 * Reactive, not pre-emptive: ask, get refused, ask the human, retry. The server owns the freshness
 * rule, so the UI keeps no copy of the window to fall out of sync -- and the common path, changing
 * something right after signing in, never sees this at all.
 */

interface Pending {
  run: () => Promise<void>;
  canUsePassword: boolean;
  /** What the person was trying to do, so the prompt can say why it is asking. */
  label: string;
}

export interface StepUp {
  /**
   * Run an action, and if the server wants re-confirmation, ask for it and run the action again.
   * Any other failure is rethrown so the caller's own error handling still owns it.
   */
  guard: (label: string, run: () => Promise<void>) => Promise<void>;
  prompt: ReactNode;
}

export function useStepUp(): StepUp {
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback(async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      if (!isReauthRequired(err)) throw err;
      setPending({ run, canUsePassword: reauthCanUsePassword(err), label });
    }
  }, []);

  const prompt = pending ? (
    <StepUpDialog
      pending={pending}
      onClose={() => setPending(null)}
      onConfirmed={async () => {
        const { run } = pending;
        setPending(null);
        await run();
      }}
    />
  ) : null;

  return { guard, prompt };
}

function StepUpDialog({
  pending,
  onClose,
  onConfirmed,
}: {
  pending: Pending;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}): ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus starts inside the dialog rather than wherever the page left it. Without
  // the move, a keyboard or screen-reader user is told a dialog opened and then has to hunt for it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await authApi.reauth(password);
      await onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  /*
   * Portalled into <body>. A transformed ancestor becomes the containing block for
   * `position: fixed`, and AccountShell's entrance animation leaves one behind forever -- inline,
   * this full-screen backdrop got sized and anchored to the card instead of the viewport.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm"
      // A click on the backdrop closes, but only when it started there, or dragging to select text
      // inside the dialog and releasing outside counts as "clicked away".
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stepup-title"
        aria-describedby="stepup-why"
        className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-2xl shadow-black/60"
      >
        <h2 id="stepup-title" className="text-lg font-semibold">
          Quick check, is this you?
        </h2>
        <p id="stepup-why" className="mt-2 text-sm leading-relaxed text-muted">
          {pending.canUsePassword ? (
            <>
              You are about to {pending.label}. Since that changes how you sign in, confirm your
              password first. We will not ask again for a few minutes.
            </>
          ) : (
            <>
              You are about to {pending.label}, and this browser has been signed in a while. Sign in
              with Google again, or send yourself a password reset link, and it will go straight
              through.
            </>
          )}
        </p>

        {pending.canUsePassword ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <label className="sr-only" htmlFor="stepup-password">
              Your password
            </label>
            <PasswordInput
              id="stepup-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="Your password"
              required
            />
            {error && (
              <p role="alert" className="text-sm text-neg">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
              >
                Not now
              </button>
              <button
                type="submit"
                disabled={busy || password.length === 0}
                className="btn-primary flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
              >
                {busy ? 'Checking...' : 'Confirm'}
              </button>
            </div>
            {busy && (
              <p role="status" className="mt-2 text-center text-xs text-muted">
                {reassurance('reauth')}
              </p>
            )}
          </form>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
            >
              Not now
            </button>
            <a
              href="/forgot-password"
              className="btn-primary flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold"
            >
              Email me a link
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
