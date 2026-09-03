import { useState, type FormEvent, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../lib/api';
import { inputClass, labelClass } from './AuthCard';
import { PasswordInput } from './PasswordInput';

/*
 * The one thing on this page that cannot be undone.
 *
 * Its own component because it owns five pieces of state that exist only while somebody is halfway
 * through deleting, and none of the rest of the account page has any business reading them.
 *
 * What it asks for depends on how the account signs in: a password if there is one, otherwise the
 * email address typed out. The server asks for the same thing again, and for a passwordless account
 * also for a session that has proved itself recently -- typing your own address is confirmation,
 * not proof.
 */
export function DeleteAccount({ user }: { user: AuthUser }): ReactNode {
  const [showDelete, setShowDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function submitDelete(e: FormEvent): Promise<void> {
    e.preventDefault();
    setDeleting(true);
    setDeleteError(null);
    try {
      await authApi.deleteAccount(
        user.hasPassword ? { password: deletePw } : { confirm: deleteConfirm },
      );
      window.location.replace('/login');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  return (
    <section aria-label="Danger zone" className="mt-8">
      <hr className="mb-6 border-line" />
      {showDelete ? (
        <form
          onSubmit={(e) => void submitDelete(e)}
          className="space-y-3 rounded-xl border border-neg/30 bg-neg/5 p-4"
        >
          <h2 className="text-sm font-semibold text-neg">Delete account</h2>
          <p className="text-sm text-muted">
            This permanently deletes your account and signs you out of every app. It cannot be
            undone.
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
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user.email}
                autoComplete="off"
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
              className="cursor-pointer rounded-full bg-neg px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete my account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDelete(false);
                setDeleteError(null);
                setDeletePw('');
                setDeleteConfirm('');
              }}
              className="cursor-pointer rounded-full border border-line px-4 py-2.5 text-sm text-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="cursor-pointer text-sm font-medium text-neg hover:underline"
        >
          Delete account
        </button>
      )}
    </section>
  );
}
