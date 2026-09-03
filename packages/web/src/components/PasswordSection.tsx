import { useState, type FormEvent, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../lib/api';
import { labelClass } from './AuthCard';
import { PasswordInput } from './PasswordInput';
import { PasswordStrength } from './PasswordStrength';

/*
 * Setting a password, and changing one.
 *
 * Two flows in one form because they differ only in what proves you may: changing already requires
 * the old password, while an account that signs in with Google has none to ask for, so adding one
 * goes through the step-up prompt instead.
 *
 * `changingPw` stays with the page rather than here: opening this form hides most of the rest of
 * the account page, and the security-review banner opens it too.
 */
export function PasswordSection({
  user,
  changingPw,
  setChangingPw,
  pwDone,
  setPwDone,
  guard,
  onPasswordAdded,
  onFinished,
}: {
  user: AuthUser;
  changingPw: boolean;
  setChangingPw: (open: boolean) => void;
  /* Paired with changingPw on the page: the security-review banner opens this form and clears the
     last confirmation in the same breath, so both flags have to be reachable from out there. */
  pwDone: boolean;
  setPwDone: (done: boolean) => void;
  /** Runs an action behind the step-up prompt, for the half that has no old password to ask for. */
  guard: (label: string, run: () => Promise<void>) => Promise<void>;
  onPasswordAdded: () => void;
  /** Lets the page retire the security-review banner once the password is dealt with. */
  onFinished: () => void;
}): ReactNode {
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwWasSet, setPwWasSet] = useState(false);

  function resetPwForm(): void {
    setCurPw('');
    setNewPw('');
    setConfirmPw('');
    setPwError(null);
  }

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwError('Those passwords do not match.');
      return;
    }
    setPwSaving(true);
    setPwError(null);
    try {
      if (user.hasPassword) {
        // Changing a password already proves you know the old one, so it needs no extra step.
        await authApi.changePassword(curPw, newPw);
        setPwWasSet(false);
      } else {
        await guard('add a password', async () => {
          await authApi.setPassword(newPw);
          onPasswordAdded();
          setPwWasSet(true);
        });
      }
      setChangingPw(false);
      resetPwForm();
      setPwDone(true);
      onFinished();
    } catch (err) {
      setPwError(
        err instanceof Error
          ? err.message
          : user.hasPassword
            ? 'Could not change your password.'
            : 'Could not set your password.',
      );
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <section aria-label="Security">
      {changingPw ? (
        <form onSubmit={(e) => void submitPassword(e)} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            {user.hasPassword ? 'Change password' : 'Set a password'}
          </h2>
          {!user.hasPassword && (
            <p className="text-sm text-muted">
              You signed up with Google. Add a password to also sign in with your email.
            </p>
          )}
          {user.hasPassword && (
            <div>
              <label htmlFor="current-password" className={labelClass}>
                Current password
              </label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                placeholder="Current password"
                value={curPw}
                onChange={setCurPw}
                required
                autoFocus
              />
            </div>
          )}
          <div>
            <label htmlFor="new-password" className={labelClass}>
              New password
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              placeholder="8+ characters"
              value={newPw}
              onChange={setNewPw}
              required
              minLength={8}
              autoFocus={!user.hasPassword}
            />
            <PasswordStrength value={newPw} />
          </div>
          <div>
            <label htmlFor="confirm-new-password" className={labelClass}>
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPw}
              onChange={setConfirmPw}
              required
              minLength={8}
            />
          </div>
          {pwError && (
            <p
              role="alert"
              className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg"
            >
              {pwError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-gradient cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pwSaving}
            >
              {pwSaving ? 'Saving...' : user.hasPassword ? 'Update password' : 'Set password'}
            </button>
            <button
              type="button"
              onClick={() => {
                setChangingPw(false);
                resetPwForm();
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
          onClick={() => {
            setPwDone(false);
            setChangingPw(true);
          }}
          className="cursor-pointer text-sm font-medium text-accent hover:underline"
        >
          {user.hasPassword ? 'Change password' : 'Set a password'}
        </button>
      )}
      {pwDone && !changingPw && (
        <p className="mt-2 text-sm text-pos">
          {pwWasSet
            ? 'Password set. You can now sign in with your email and password too.'
            : "Password changed. You've been signed out on other devices."}
        </p>
      )}
    </section>
  );
}
