import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authApi, googleConnectUrl, googleEnabled, type AuthUser } from '../lib/api';
import { AuthCard, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordStrength } from '../components/PasswordStrength';
import { APPS, appHref } from '../lib/apps';

export function AccountPage(): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [resent, setResent] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  // Tracks which action just succeeded, so the confirmation reads correctly (adding a first
  // password does not sign other devices out, unlike a change).
  const [pwWasSet, setPwWasSet] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [googleMsg, setGoogleMsg] = useState<string | null>(null);

  async function disconnectGoogle(): Promise<void> {
    if (!user) return;
    setDisconnecting(true);
    setGoogleMsg(null);
    try {
      await authApi.disconnectGoogle();
      setUser({ ...user, hasGoogle: false });
    } catch (err) {
      setGoogleMsg(err instanceof Error ? err.message : 'Could not disconnect Google.');
    } finally {
      setDisconnecting(false);
    }
  }

  function resetPwForm(): void {
    setCurPw('');
    setNewPw('');
    setConfirmPw('');
    setPwError(null);
  }

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!user) return;
    if (newPw !== confirmPw) {
      setPwError('Those passwords do not match.');
      return;
    }
    setPwSaving(true);
    setPwError(null);
    try {
      if (user.hasPassword) {
        await authApi.changePassword(curPw, newPw);
        setPwWasSet(false);
      } else {
        await authApi.setPassword(newPw);
        setUser({ ...user, hasPassword: true });
        setPwWasSet(true);
      }
      setChangingPw(false);
      resetPwForm();
      setPwDone(true);
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

  function startEditName(): void {
    if (!user) return;
    setNameDraft(user.displayName);
    setNameError(null);
    setEditingName(true);
  }

  async function saveName(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!user) return;
    const next = nameDraft.trim();
    if (!next) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (next === user.displayName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const r = await authApi.updateProfile(next);
      setUser(r.user);
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSavingName(false);
    }
  }

  useEffect(() => {
    authApi
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  // Surface a failed "Connect Google" round-trip (the callback redirects here with ?error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') !== 'google_failed') return;
    const reason = params.get('reason');
    setGoogleMsg(
      reason === 'google_already_linked'
        ? 'That Google account is already linked to a different account.'
        : reason === 'link_unauthenticated'
          ? 'Your session expired. Sign in again to connect Google.'
          : 'Could not connect Google. Please try again.',
    );
    window.history.replaceState({}, '', '/account');
  }, []);

  async function logout(): Promise<void> {
    await authApi.logout().catch(() => undefined);
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <AuthCard title="Your account">
        <p className="text-sm text-muted">Loading...</p>
      </AuthCard>
    );
  }
  if (!user) return null;

  return (
    <AuthCard title="Your account" subtitle="One login for all of aidenjang's apps." showApps={false}>
      {/* App launcher — this is the landing when a visitor signs in at
          aidenjang.com without being sent back to a specific app, so lead
          with somewhere to go. Hidden while changing password so that flow
          stays focused. Sourced from lib/apps.ts. */}
      {!changingPw && (
      <section aria-label="Apps">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Jump into an app</h2>
        <ul className="mt-3 space-y-2">
          {APPS.map((app) => (
            <li key={app.name}>
              <a
                href={appHref(app)}
                className="group flex items-center justify-between rounded-xl border border-line bg-field px-4 py-3 transition hover:border-accent"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: app.accent }}
                  />
                  <span>
                    <span className="font-medium text-ink">{app.name}</span>
                    <span className="block text-xs text-muted">{app.tagline}</span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                >
                  &rarr;
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      )}

      {!changingPw && <hr className="my-6 border-line" />}

      <dl className="space-y-3 text-sm">
        {editingName ? (
          <div>
            <dt className="mb-1.5 text-muted">Name</dt>
            <form onSubmit={(e) => void saveName(e)} className="flex items-center gap-2">
              <input
                className={inputClass}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                autoFocus
                aria-label="Display name"
              />
              <button
                className="btn-gradient shrink-0 cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-semibold disabled:opacity-60"
                disabled={savingName}
              >
                {savingName ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2.5 text-sm text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </form>
            {nameError && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-neg">
                {nameError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Name</dt>
            <dd className="flex items-center gap-2 font-medium">
              {user.displayName}
              <button
                type="button"
                onClick={startEditName}
                className="cursor-pointer text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email status</dt>
          <dd>
            {user.emailVerified ? (
              <span className="rounded-full border border-pos/30 bg-pos/10 px-2.5 py-0.5 text-xs font-medium text-pos">verified</span>
            ) : (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">unverified</span>
            )}
          </dd>
        </div>
      </dl>

      {!user.emailVerified && (
        <button
          type="button"
          onClick={() => void authApi.resendVerification().then(() => setResent(true))}
          className="mt-4 text-sm font-medium text-accent hover:underline"
        >
          {resent ? 'Verification email sent' : 'Resend verification email'}
        </button>
      )}

      <hr className="my-6 border-line" />

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
              <p role="alert" className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm font-medium text-neg">
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

      {googleEnabled && !changingPw && (
        <>
          <hr className="my-6 border-line" />
          <section aria-label="Connected accounts">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Connected accounts</h2>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-line bg-field px-4 py-3">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-ink">Google</span>
                  <span className="block text-xs text-muted">{user.hasGoogle ? 'Connected' : 'Not connected'}</span>
                </span>
              </span>
              {user.hasGoogle ? (
                user.hasPassword ? (
                  <button
                    type="button"
                    onClick={() => void disconnectGoogle()}
                    disabled={disconnecting}
                    className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-60"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Set a password to disconnect</span>
                )
              ) : (
                <a
                  href={googleConnectUrl('/account')}
                  className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium text-accent transition hover:border-accent"
                >
                  Connect
                </a>
              )}
            </div>
            {googleMsg && (
              <p role="alert" className="mt-2 text-sm font-medium text-neg">
                {googleMsg}
              </p>
            )}
          </section>
        </>
      )}

      <button type="button" onClick={() => void logout()} className={`${buttonClass} mt-6`}>
        Log out
      </button>

      <nav className="mt-6 flex justify-center gap-5 text-xs text-muted">
        <a href="/privacy" className="hover:text-accent hover:underline">
          Privacy
        </a>
        <a href="/terms" className="hover:text-accent hover:underline">
          Terms
        </a>
      </nav>
    </AuthCard>
  );
}
