import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useReturnFocus } from '../lib/useReturnFocus';
import { authApi, type AuthUser } from '../lib/api';
import { inputClass, labelClass } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import type { StepUp } from './StepUpPrompt';
import { forgetRecentAccount } from '../lib/recentAccount';
import { announceSessionChange } from '../lib/sessionChanges';

const confirmDeletionPath = '/account?delete=confirm#delete-account';

/* What this asks for depends on how the account signs in, and the server asks again either way --
   see the delete-account route for which proof it demands and why. */
export function DeleteAccount({
  user,
  guard,
}: {
  user: AuthUser;
  guard: StepUp['guard'];
}): ReactNode {
  const [showDelete, setShowDelete] = useState(
    () => new URLSearchParams(window.location.search).get('delete') === 'confirm',
  );
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(showDelete, () => deleteTrigger.current);
  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function submitDelete(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (deleting) return;
    const trigger = (e.nativeEvent as SubmitEvent).submitter;
    setDeleting(true);
    setDeleteError(null);
    try {
      const deleted = await guard(
        'delete your account',
        async () => {
          await authApi.deleteAccount(
            user.hasPassword ? { password: deletePw } : { confirm: deleteConfirm },
          );
        },
        trigger,
        confirmDeletionPath,
      );
      if (!deleted) return;
      forgetRecentAccount(user.email);
      announceSessionChange();
      window.location.replace('/login');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
    } finally {
      setDeleting(false);
    }
  }

  function closeDelete(): void {
    const url = new URL(window.location.href);
    if (url.searchParams.has('delete')) {
      url.searchParams.delete('delete');
      if (url.hash === '#delete-account') url.hash = '';
      window.history.replaceState(window.history.state, '', url);
    }
    setShowDelete(false);
    setDeleteError(null);
    setDeletePw('');
    setDeleteConfirm('');
  }

  return (
    <section id="delete-account" aria-label="Danger zone" className="hub-danger">
      {showDelete ? (
        <form
          onSubmit={(e) => void submitDelete(e)}
          className="space-y-3 rounded-xl border border-neg/30 bg-neg/5 p-4"
        >
          <h2 className="text-sm font-semibold text-neg">Delete account</h2>
          <p className="text-sm text-muted">
            This permanently deletes your account and signs you out of every app. It cannot be
            undone. App data is managed separately. Delete it in each app before removing your
            sign-in.
          </p>
          {user.hasPassword ? (
            <div>
              {/* Labelled, not just placeheld: a placeholder disappears on the first keystroke
                    and is the only name a screen reader had for the field guarding this. */}
              <label htmlFor="delete-password" className={labelClass}>
                Your password
              </label>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                placeholder="Your password"
                value={deletePw}
                autoFocus
                onChange={setDeletePw}
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="delete-confirm" className={labelClass}>
                Type your email to confirm
              </label>
              <input
                id="delete-confirm"
                className={inputClass}
                value={deleteConfirm}
                autoFocus
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user.email}
                autoComplete="off"
                readOnly={deleting}
                required
              />
            </div>
          )}
          {deleteError && (
            <p role="alert" className="text-sm font-medium text-neg">
              {deleteError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="cursor-pointer rounded-full bg-neg px-5 py-2.5 text-sm font-semibold text-canvas transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete my account'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={closeDelete}
              className="cursor-pointer rounded-full border border-line px-4 py-2.5 text-sm text-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          ref={deleteTrigger}
          onClick={() => setShowDelete(true)}
          className="cursor-pointer text-sm font-medium text-neg hover:underline"
        >
          Delete account
        </button>
      )}
    </section>
  );
}
