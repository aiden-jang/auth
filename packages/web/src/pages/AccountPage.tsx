import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  authApi,
  googleConnectUrl,
  googleEnabled,
  type AuthUser,
  type SessionInfo,
} from '../lib/api';
import { AccountShell, buttonClass, inputClass, labelClass } from '../components/AuthCard';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordStrength } from '../components/PasswordStrength';
import { Skeleton } from '../components/Skeleton';
import { APPS, appHref } from '../lib/apps';
import { SecurityActivity } from '../components/SecurityActivity';
import { RecoveryRehearsal } from '../components/RecoveryRehearsal';
import { securityCheckup, type SecurityAction } from '../lib/securityCheckup';
import { sessionHorizon } from '../lib/sessionHorizon';
import { useStepUp } from '../components/StepUpPrompt';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < 2 * min) return 'active now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AccountPage(): ReactNode {
  // Intercepts a REAUTH_REQUIRED refusal from the server and re-runs the action once confirmed.
  const stepUp = useStepUp();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<'sending' | 'sent' | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
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
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [securityReview, setSecurityReview] = useState(
    () => new URLSearchParams(window.location.search).get('security') === 'review',
  );
  const [securityReviewStatus, setSecurityReviewStatus] = useState<'securing' | 'secured' | null>(null);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [sessionsRefreshed, setSessionsRefreshed] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [sessionNameDraft, setSessionNameDraft] = useState('');
  const [savingSessionName, setSavingSessionName] = useState(false);
  const [securityRevision, setSecurityRevision] = useState(0);
  const [exportStatus, setExportStatus] = useState<'exporting' | 'downloaded' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function revoke(id: string): Promise<void> {
    setRevokingId(id);
    setSessionError(null);
    try {
      await authApi.revokeSession(id);
      setSessions((s) => s?.filter((x) => x.id !== id) ?? null);
      setExpandedSessionId((current) => (current === id ? null : current));
      setSecurityRevision((value) => value + 1);
    } catch {
      setSessionError('Couldn’t sign that device out. Try again.');
    } finally {
      setRevokingId(null);
    }
  }

  function beginSessionRename(session: SessionInfo): void {
    setRenamingSessionId(session.id);
    setSessionNameDraft(session.device ?? '');
    setSessionError(null);
  }

  async function renameSession(event: FormEvent, id: string): Promise<void> {
    event.preventDefault();
    const label = sessionNameDraft.trim();
    if (!label) return;
    setSavingSessionName(true);
    setSessionError(null);
    try {
      const { session } = await authApi.renameSession(id, label);
      setSessions(
        (current) =>
          current?.map((item) => (item.id === id ? { ...item, device: session.device } : item)) ??
          null,
      );
      setRenamingSessionId(null);
      setSessionNameDraft('');
      setSecurityRevision((value) => value + 1);
    } catch {
      setSessionError('Couldn’t rename that device. Try again.');
    } finally {
      setSavingSessionName(false);
    }
  }

  async function revokeOthers(): Promise<boolean> {
    setRevokingOthers(true);
    setSessionError(null);
    try {
      await authApi.revokeOtherSessions();
      setSessions((s) => s?.filter((x) => x.current) ?? null);
      setSecurityRevision((value) => value + 1);
      return true;
    } catch {
      setSessionError('Couldn’t sign the other devices out. Try again.');
      return false;
    } finally {
      setRevokingOthers(false);
    }
  }

  function dismissSecurityReview(): void {
    setSecurityReview(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('security');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function secureAccount(): Promise<void> {
    if (!user || securityReviewStatus === 'securing') return;
    setSecurityReviewStatus('securing');
    const secured = await revokeOthers();
    if (!secured) {
      setSecurityReviewStatus(null);
      return;
    }
    setSecurityReviewStatus('secured');
    if (user.hasPassword) {
      setPwDone(false);
      setChangingPw(true);
    }
  }

  async function refreshSessions(manual = false): Promise<void> {
    if (manual) setRefreshingSessions(true);
    setSessionError(null);
    try {
      const result = await authApi.listSessions();
      setSessions(result.sessions);
      if (manual) {
        setSessionsRefreshed(true);
        window.setTimeout(() => setSessionsRefreshed(false), 1800);
      }
    } catch {
      // Preserve a previously loaded list. A refresh failure should not make every known session
      // disappear and falsely imply that no devices are signed in.
      setSessions((current) => current ?? []);
      setSessionError('Couldn’t refresh active devices. Try again.');
    } finally {
      if (manual) setRefreshingSessions(false);
    }
  }

  async function resendVerification(): Promise<void> {
    if (verificationStatus === 'sending') return;
    setVerificationStatus('sending');
    setVerificationError(null);
    try {
      await authApi.resendVerification();
      setVerificationStatus('sent');
      window.setTimeout(() => setVerificationStatus(null), 3000);
    } catch (err) {
      setVerificationStatus(null);
      setVerificationError(
        err instanceof Error ? err.message : 'Couldn’t send the verification email.',
      );
    }
  }

  async function downloadAccountData(): Promise<void> {
    if (exportStatus) return;
    setExportStatus('exporting');
    setExportError(null);
    try {
      const data = await authApi.exportAccount();
      const href = URL.createObjectURL(
        new Blob([`${JSON.stringify(data, null, 2)}\n`], {
          type: 'application/json;charset=utf-8',
        }),
      );
      const link = document.createElement('a');
      link.href = href;
      link.download = `aidenjang-account-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setExportStatus('downloaded');
      window.setTimeout(() => setExportStatus(null), 2200);
    } catch {
      setExportStatus(null);
      setExportError('Couldn’t prepare your account data. Try again.');
    }
  }

  async function copyEmail(): Promise<void> {
    if (!user || emailCopied) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 1800);
    } catch {
      // The address remains selectable as the no-fail fallback.
    }
  }

  async function submitDelete(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!user) return;
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

  async function disconnectGoogle(): Promise<void> {
    if (!user) return;
    setDisconnecting(true);
    setGoogleMsg(null);
    try {
      await stepUp.guard('unlink Google', async () => {
        await authApi.disconnectGoogle();
        setUser({ ...user, hasGoogle: false });
        setSecurityRevision((value) => value + 1);
      });
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
        // Changing a password already proves you know the old one, so it needs no extra step.
        await authApi.changePassword(curPw, newPw);
        setPwWasSet(false);
      } else {
        await stepUp.guard('add a password', async () => {
          await authApi.setPassword(newPw);
          setUser({ ...user, hasPassword: true });
          setPwWasSet(true);
        });
      }
      setChangingPw(false);
      resetPwForm();
      setPwDone(true);
      if (securityReviewStatus === 'secured') dismissSecurityReview();
      setSecurityRevision((value) => value + 1);
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
    const checkAuth = (): void => {
      authApi
        .me()
        .then((r) => setUser(r.user))
        .catch(() => {
          window.location.replace('/login');
        })
        .finally(() => setLoading(false));
    };
    checkAuth();
    // The back/forward cache can restore this page with its old (logged-in) React
    // state after a sign-out — so hitting "back" post-logout looks still-logged-in.
    // A bfcache restore fires pageshow with persisted=true and does NOT remount, so
    // re-validate the session there and bounce a signed-out user to /login.
    const onPageShow = (e: PageTransitionEvent): void => {
      if (!e.persisted) return;
      setLoading(true); // show the skeleton, not the stale account, while we re-check
      checkAuth();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    void refreshSessions();
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
    window.location.replace('/login');
  }

  if (loading) {
    return (
      <AccountShell title="Your account" subtitle="One login for all of aidenjang's apps.">
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="mt-6 h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      </AccountShell>
    );
  }
  if (!user) return null;

  const checkup = securityCheckup(user, sessions);

  function runSecurityAction(action: SecurityAction): void {
    if (action === 'verify_email') {
      void resendVerification();
      return;
    }
    if (action === 'add_password') {
      setPwDone(false);
      setChangingPw(true);
      return;
    }
    document
      .getElementById('active-sessions')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <AccountShell title="Your account" subtitle="One login for all of aidenjang's apps.">
      {stepUp.prompt}
      {securityReview && (
        <section
          aria-labelledby="sign-in-review-heading"
          className="rounded-2xl border border-accent/30 bg-accent/10 p-4"
        >
          {securityReviewStatus === 'secured' ? (
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pos/15 font-bold text-pos">✓</span>
              <div className="min-w-0 flex-1">
                <h2 id="sign-in-review-heading" className="text-sm font-semibold text-ink">Other devices are signed out</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {user.hasPassword
                    ? 'Finish by changing your password below. This device will stay signed in.'
                    : 'This device stayed signed in. Your Google account remains your sign-in method.'}
                </p>
                {!user.hasPassword && (
                  <button type="button" onClick={dismissSecurityReview} className="mt-2 text-xs font-semibold text-accent hover:underline">
                    Done
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">New sign-in review</p>
              <h2 id="sign-in-review-heading" className="mt-1 text-base font-semibold text-ink">Was that sign-in you?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                If the device or location in the email looked wrong, lock every other session out now.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void secureAccount()}
                  disabled={securityReviewStatus === 'securing'}
                  className="btn-gradient rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {securityReviewStatus === 'securing' ? 'Securing account…' : 'No — secure my account'}
                </button>
                <button
                  type="button"
                  onClick={dismissSecurityReview}
                  className="rounded-full border border-line px-4 py-2 text-sm font-medium text-muted transition hover:text-ink"
                >
                  Yes, it was me
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* App launcher — this is the landing when a visitor signs in at
          aidenjang.com without being sent back to a specific app, so lead
          with somewhere to go. Hidden while changing password so that flow
          stays focused. Sourced from lib/apps.ts. */}
      {!changingPw && (
        <section aria-label="Apps">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            Jump into an app
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
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
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">{user.email}</span>
            <button
              type="button"
              onClick={() => void copyEmail()}
              className="shrink-0 text-xs font-medium text-accent hover:underline"
            >
              {emailCopied ? 'Copied' : 'Copy'}
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email status</dt>
          <dd>
            {user.emailVerified ? (
              <span className="rounded-full border border-pos/30 bg-pos/10 px-2.5 py-0.5 text-xs font-medium text-pos">
                verified
              </span>
            ) : (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">
                unverified
              </span>
            )}
          </dd>
        </div>
      </dl>

      {!user.emailVerified && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={verificationStatus !== null}
            className="text-sm font-medium text-accent hover:underline disabled:cursor-default disabled:opacity-60"
          >
            {verificationStatus === 'sending'
              ? 'Sending verification email…'
              : verificationStatus === 'sent'
                ? 'Verification email sent'
                : 'Resend verification email'}
          </button>
          {verificationError && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-neg">
              {verificationError}
            </p>
          )}
        </div>
      )}

      <hr className="my-6 border-line" />

      {!changingPw && (
        <>
        <section aria-label="Security check-up" className="rounded-2xl border border-line bg-field p-4">
          <div className="flex items-center gap-4">
            <div
              className="grid h-20 w-20 shrink-0 place-items-center rounded-full p-[5px]"
              style={{
                background:
                  checkup.score === null
                    ? 'var(--color-line)'
                    : `conic-gradient(var(--color-pos) ${checkup.score}%, var(--color-line) 0)`,
              }}
              role="img"
              aria-label={
                checkup.score === null
                  ? 'Security check-up is loading'
                  : `${checkup.score}% of security checks complete`
              }
            >
              <span className="grid h-full w-full place-items-center rounded-full bg-field text-center">
                <span>
                  <strong className="block text-lg font-semibold text-ink">
                    {checkup.score === null ? '…' : `${checkup.score}%`}
                  </strong>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {checkup.label}
                  </span>
                </span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">Security check-up</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Four checks, with no mystery points. Fixes lead straight to the right control.
              </p>
              {checkup.nextAction && (
                <button
                  type="button"
                  onClick={() => runSecurityAction(checkup.nextAction!.action!)}
                  disabled={
                    checkup.nextAction.action === 'verify_email' && verificationStatus !== null
                  }
                  className="mt-2 text-xs font-semibold text-accent hover:underline disabled:cursor-default disabled:opacity-60"
                >
                  {checkup.nextAction.action === 'verify_email' && verificationStatus === 'sending'
                    ? 'Sending verification email…'
                    : checkup.nextAction.label}
                  {checkup.nextAction.action !== 'verify_email' && ' →'}
                </button>
              )}
            </div>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {checkup.checks.map((check) => (
              <li
                key={check.id}
                className="flex gap-2.5 rounded-xl border border-line bg-card/40 px-3 py-2.5"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    check.state === 'pass'
                      ? 'bg-pos/15 text-pos'
                      : check.state === 'action'
                        ? 'bg-neg/15 text-neg'
                        : 'bg-line text-muted'
                  }`}
                >
                  {check.state === 'pass' ? '✓' : check.state === 'action' ? '!' : '·'}
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs font-semibold text-ink">{check.label}</strong>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    {check.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <RecoveryRehearsal
          user={user}
          activeSessions={sessions?.length ?? 0}
          onReviewSessions={() => runSecurityAction('review_sessions')}
          onVerifyEmail={() => void resendVerification()}
        />
        </>
      )}

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

      {googleEnabled && !changingPw && (
        <>
          <hr className="my-6 border-line" />
          <section aria-label="Connected accounts">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              Connected accounts
            </h2>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-line bg-field px-4 py-3">
              <span className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
                  />
                </svg>
                <span>
                  <span className="block text-sm font-medium text-ink">Google</span>
                  <span className="block text-xs text-muted">
                    {user.hasGoogle ? 'Connected' : 'Not connected'}
                  </span>
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

      {!changingPw && (
        <>
          <hr className="my-6 border-line" />
          <section id="active-sessions" aria-label="Active sessions" className="scroll-mt-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                Active sessions
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void refreshSessions(true)}
                  disabled={refreshingSessions}
                  className="text-xs font-medium text-muted hover:text-accent hover:underline disabled:cursor-default disabled:opacity-60"
                >
                  {refreshingSessions
                    ? 'Refreshing…'
                    : sessionsRefreshed
                      ? 'Up to date'
                      : 'Refresh'}
                </button>
                {sessions && sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void revokeOthers()}
                    disabled={revokingOthers}
                    className="cursor-pointer text-xs font-medium text-accent hover:underline disabled:opacity-60"
                  >
                    {revokingOthers ? 'Signing out...' : 'Sign out everywhere else'}
                  </button>
                )}
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {sessions === null ? (
                <>
                  <li>
                    <Skeleton className="h-14 w-full" />
                  </li>
                  <li>
                    <Skeleton className="h-14 w-full" />
                  </li>
                </>
              ) : sessions.length === 0 ? (
                <li className="text-sm text-muted">No active sessions.</li>
              ) : (
                sessions.map((s) => {
                  const expanded = expandedSessionId === s.id;
                  const horizon = sessionHorizon(s.createdAt, s.expiresAt);
                  const recentlyAdded =
                    !s.current &&
                    Date.now() - new Date(s.createdAt).getTime() < 24 * 60 * 60 * 1000;
                  return (
                    <li key={s.id} className="rounded-xl border border-line bg-field px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => setExpandedSessionId(expanded ? null : s.id)}
                          aria-expanded={expanded}
                          className="min-w-0 flex-1 cursor-pointer text-left"
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink">
                              {s.device ?? 'Unknown device'}
                            </span>
                            {s.current && (
                              <span className="shrink-0 rounded-full border border-pos/30 bg-pos/10 px-2 py-0.5 text-xs font-medium text-pos">
                                this device
                              </span>
                            )}
                            {recentlyAdded && (
                              <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                new
                              </span>
                            )}
                            {horizon.tone === 'soon' && (
                              <span className="shrink-0 rounded-full border border-neg/25 bg-neg/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neg">
                                expires soon
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-muted">
                            {[s.location, timeAgo(s.lastSeenAt)].filter(Boolean).join(' · ')} ·{' '}
                            {expanded ? 'hide details' : 'details'}
                          </span>
                        </button>
                        {!s.current && (
                          <button
                            type="button"
                            onClick={() => void revoke(s.id)}
                            disabled={revokingId === s.id}
                            className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-60"
                          >
                            {revokingId === s.id ? '...' : 'Sign out'}
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div className="mt-3 border-t border-line pt-3">
                          <dl className="grid gap-2 text-xs sm:grid-cols-4">
                            <div>
                              <dt className="text-muted">First signed in</dt>
                              <dd className="mt-0.5 font-medium text-ink">
                                {exactTime(s.createdAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Last active</dt>
                              <dd className="mt-0.5 font-medium text-ink">
                                {exactTime(s.lastSeenAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Approximate location</dt>
                              <dd className="mt-0.5 font-medium text-ink">
                                {s.location ?? 'Not available'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted">Session lifetime</dt>
                              <dd
                                className={`mt-0.5 font-medium ${
                                  horizon.tone === 'soon' ? 'text-neg' : 'text-ink'
                                }`}
                              >
                                {horizon.label}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted">
                              <span>session time remaining</span>
                              <span className="tnum">{horizon.percentRemaining}%</span>
                            </div>
                            <div
                              className="h-1.5 overflow-hidden rounded-full bg-line"
                              role="progressbar"
                              aria-label={`${s.device ?? 'This session'} lifetime remaining`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={horizon.percentRemaining}
                            >
                              <div
                                className={`h-full rounded-full transition-[width] ${
                                  horizon.tone === 'soon' ? 'bg-neg' : 'bg-accent'
                                }`}
                                style={{ width: `${horizon.percentRemaining}%` }}
                              />
                            </div>
                          </div>
                          {renamingSessionId === s.id ? (
                            <form
                              onSubmit={(event) => void renameSession(event, s.id)}
                              className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-canvas/50 p-3 sm:flex-row sm:items-end"
                            >
                              <label className="min-w-0 flex-1 text-xs font-medium text-muted">
                                Device name
                                <input
                                  autoFocus
                                  maxLength={40}
                                  value={sessionNameDraft}
                                  onChange={(event) => setSessionNameDraft(event.target.value)}
                                  placeholder="Personal MacBook"
                                  className={`${inputClass} mt-1 py-2`}
                                />
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingSessionId(null);
                                    setSessionNameDraft('');
                                  }}
                                  className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted hover:text-ink"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={savingSessionName || !sessionNameDraft.trim()}
                                  className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {savingSessionName ? 'Saving…' : 'Save name'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginSessionRename(s)}
                              className="mt-3 text-xs font-medium text-accent hover:underline"
                            >
                              Rename device
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
            {sessionError && (
              <p role="alert" className="mt-3 text-sm font-medium text-neg">
                {sessionError}
              </p>
            )}
          </section>
          <hr className="my-6 border-line" />
          <SecurityActivity refreshKey={securityRevision} />
          <hr className="my-6 border-line" />
          <section
            aria-labelledby="your-data-heading"
            className="flex items-center justify-between gap-4"
          >
            <div>
              <h2
                id="your-data-heading"
                className="text-xs font-medium uppercase tracking-wide text-muted"
              >
                Your data
              </h2>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                Download your profile, sign-in methods, active devices, and security history as
                JSON. Passwords and session credentials are never included.
              </p>
              {exportError && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-neg">
                  {exportError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void downloadAccountData()}
              disabled={exportStatus !== null}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-60"
            >
              {exportStatus === 'exporting'
                ? 'Preparing…'
                : exportStatus === 'downloaded'
                  ? 'Downloaded'
                  : 'Download copy'}
            </button>
          </section>
        </>
      )}

      <button type="button" onClick={() => void logout()} className={`${buttonClass} mt-6`}>
        Log out
      </button>

      {!changingPw && (
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
                <PasswordInput
                  id="delete-password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={deletePw}
                  onChange={setDeletePw}
                  required
                />
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
      )}

      <nav className="mt-6 flex justify-center gap-5 text-xs text-muted">
        <a href="/privacy" className="hover:text-accent hover:underline">
          Privacy
        </a>
        <a href="/terms" className="hover:text-accent hover:underline">
          Terms
        </a>
      </nav>
    </AccountShell>
  );
}
