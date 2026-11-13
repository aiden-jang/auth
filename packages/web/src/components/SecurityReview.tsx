import type { ReactNode } from 'react';

export function SecurityReview({
  status,
  hasPassword,
  busy,
  onDismiss,
  onSecure,
}: {
  status: 'securing' | 'secured' | 'failed' | null;
  hasPassword: boolean;
  busy: boolean;
  onDismiss: () => void;
  onSecure: () => Promise<void>;
}): ReactNode {
  return (
    <section
      aria-labelledby="sign-in-review-heading"
      className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-4"
    >
      {status === 'secured' ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pos/15 font-bold text-pos"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="sign-in-review-heading" className="text-sm font-semibold text-ink">
              Other devices are signed out
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {hasPassword
                ? 'Finish by changing your password below. This device will stay signed in.'
                : 'This device stayed signed in. Your Google account remains your sign-in method.'}
            </p>
            {!hasPassword && (
              <button
                type="button"
                onClick={onDismiss}
                className="mt-2 text-xs font-semibold text-accent hover:underline"
              >
                Done
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 id="sign-in-review-heading" className="text-base font-semibold text-ink">
            Was that sign-in you?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            If the device or location in the email looked wrong, lock every other session out now.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSecure()}
              disabled={busy}
              className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {status === 'securing' ? 'Securing account…' : 'That was not me'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={status === 'securing'}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-muted transition hover:text-ink disabled:opacity-60"
            >
              Yes, it was me
            </button>
          </div>
          {status === 'failed' && (
            <p role="alert" className="mt-3 text-sm font-medium text-neg">
              Couldn’t sign out the other devices. Try again here.
            </p>
          )}
        </>
      )}
    </section>
  );
}
