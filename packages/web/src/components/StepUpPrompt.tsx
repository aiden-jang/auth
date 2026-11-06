import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  authApi,
  googleEnabled,
  googleLoginUrl,
  isReauthRequired,
  reauthCanUsePassword,
  type AuthUser,
} from '../lib/api';
import { PasswordInput } from './PasswordInput';
import { reassurance } from '../lib/reassurance';

/*
 * Reactive, not pre-emptive: ask, get refused, ask the human, retry. The server owns the freshness
 * rule, so the UI keeps no copy of the window to fall out of sync -- and the common path, changing
 * something right after signing in, never sees this at all.
 */

interface Pending {
  resolve: (confirmed: boolean) => void;
  trigger: HTMLElement | null;
  canUsePassword: boolean;
  returnTo: string | undefined;
  /** What the person was trying to do, so the prompt can say why it is asking. */
  label: string;
}

export interface StepUp {
  /**
   * Run an action, and if the server wants re-confirmation, ask for it and run the action again.
   * Any other failure is rethrown so the caller's own error handling still owns it.
   */
  guard: (
    label: string,
    run: () => Promise<void>,
    trigger?: HTMLElement | null,
    returnTo?: string,
  ) => Promise<boolean>;
  prompt: ReactNode;
}

export function useStepUp(user: AuthUser | null, returnTo: string): StepUp {
  const [pending, setPending] = useState<Pending | null>(null);

  const pendingRef = useRef<Pending | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    current?.resolve(confirmed);
    setPending(null);
  }, []);

  const guard = useCallback(
    async (
      label: string,
      run: () => Promise<void>,
      opener?: HTMLElement | null,
      actionReturnTo?: string,
    ): Promise<boolean> => {
      if (pendingRef.current) return false;
      const trigger =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      try {
        await run();
        return true;
      } catch (err) {
        if (!isReauthRequired(err)) throw err;
        // Another action can reach this point while the first request is in flight.
        // Keep the first prompt and let the other caller clear its pending state.
        if (!mounted.current || pendingRef.current) return false;
        const confirmed = await new Promise<boolean>((resolve) => {
          const next = {
            resolve,
            trigger,
            canUsePassword: reauthCanUsePassword(err),
            returnTo: actionReturnTo,
            label,
          };
          pendingRef.current = next;
          setPending(next);
        });
        if (!confirmed) return false;
        // Resume the original caller so its error handler owns a failed action after reauthentication.
        await run();
        return true;
      }
    },
    [],
  );

  const cancel = useCallback(() => settle(false), [settle]);
  const confirm = useCallback(() => settle(true), [settle]);
  const prompt = pending ? (
    <StepUpDialog
      pending={pending}
      email={user?.email}
      googleHref={
        googleEnabled && user?.hasGoogle ? googleLoginUrl(pending.returnTo ?? returnTo) : null
      }
      recoveryHref={
        pending.returnTo
          ? `/forgot-password?return_to=${encodeURIComponent(pending.returnTo)}`
          : '/forgot-password'
      }
      onClose={cancel}
      onConfirmed={confirm}
    />
  ) : null;

  return { guard, prompt };
}

function StepUpDialog({
  pending,
  email,
  googleHref,
  recoveryHref,
  onClose,
  onConfirmed,
}: {
  pending: Pending;
  email: string | undefined;
  googleHref: string | null;
  recoveryHref: string;
  onClose: () => void;
  onConfirmed: () => void;
}): ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = pending.trigger;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        panel.current?.querySelectorAll<HTMLElement>('input, button, a[href]') ?? [],
      ).filter((control) => !control.hasAttribute('disabled'));
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (root) root.inert = wasInert;
      // The caller's pending button becomes enabled after its guard resumes.
      window.requestAnimationFrame(() => previous?.isConnected && previous.focus());
    };
  }, [onClose, pending.trigger]);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await authApi.reauth(password);
      if (panel.current?.isConnected) onConfirmed();
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
      className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center bg-canvas/80 p-4 backdrop-blur-sm"
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
        className="max-h-full w-full min-w-0 max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card p-4 shadow-2xl shadow-black/60 sm:p-6"
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
              You are about to {pending.label}, and this browser has been signed in a while.{' '}
              {googleHref
                ? 'Sign in again with your linked Google account, then retry here. You can also reset by email.'
                : 'Use a password reset link to set a password and sign in again.'}
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-auto rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
              >
                Not now
              </button>
              <button
                type="submit"
                disabled={busy || password.length === 0}
                className="btn-primary flex-auto rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50"
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-auto rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-muted transition hover:text-ink"
            >
              Not now
            </button>
            {googleHref && (
              <a
                href={googleHref}
                className="btn-primary flex-auto rounded-xl px-3 py-2.5 text-center text-sm font-semibold"
              >
                Sign in with Google
              </a>
            )}
            <Link
              to={recoveryHref}
              state={email ? { email } : undefined}
              className={`flex-auto rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${googleHref ? 'border border-line text-accent' : 'btn-primary'}`}
            >
              Reset by email
            </Link>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
