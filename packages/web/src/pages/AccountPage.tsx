import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authApi, googleEnabled, type AuthUser } from '../lib/api';
import { AccountShell, inputClass } from '../components/AuthCard';
import { Skeleton } from '../components/Skeleton';
import { AppLauncher } from '../components/AppLauncher';
import { DeleteAccount } from '../components/DeleteAccount';
import { useSessions } from '../lib/useSessions';
import { ConnectedAccounts } from '../components/ConnectedAccounts';
import { ExportAccount } from '../components/ExportAccount';
import { PasskeyList } from '../components/PasskeyList';
import { PasswordSection } from '../components/PasswordSection';
import { SessionList } from '../components/SessionList';
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

/*
 * The message a failed "Connect Google" round-trip redirects back with. Read straight from the URL
 * rather than in an effect: it cannot change while the page is open.
 */
function readGoogleLinkError(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') !== 'google_failed') return null;
  switch (params.get('reason')) {
    case 'google_already_linked':
      return 'That Google account is already linked to a different account.';
    case 'link_unauthenticated':
      return 'Your session expired. Sign in again to connect Google.';
    default:
      return 'Could not connect Google. Please try again.';
  }
}

export function AccountPage(): ReactNode {
  // Intercepts a REAUTH_REQUIRED refusal from the server and re-runs the action once confirmed.
  const stepUp = useStepUp();
  const sessions = useSessions();
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
  const [pwDone, setPwDone] = useState(false);
  // Tracks which action just succeeded, so the confirmation reads correctly (adding a first
  // password does not sign other devices out, unlike a change).
  // Read once, on the first render: the ?error the Google callback redirects back with is fixed
  // by the time this page mounts, so deriving it in an effect only costs a second render.
  const [googleLinkError] = useState(readGoogleLinkError);
  /* Stamped once. "Added in the last day" only has to be right to the hour, and reading the clock
     while rendering makes the same list render differently twice. */
  const [mountedAt] = useState(() => Date.now());
  const [googleMsg, setGoogleMsg] = useState<string | null>(googleLinkError);
  const [securityReview, setSecurityReview] = useState(
    () => new URLSearchParams(window.location.search).get('security') === 'review',
  );
  const [securityReviewStatus, setSecurityReviewStatus] = useState<'securing' | 'secured' | null>(
    null,
  );

  function dismissSecurityReview(): void {
    setSecurityReview(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('security');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function secureAccount(): Promise<void> {
    if (!user || securityReviewStatus === 'securing') return;
    setSecurityReviewStatus('securing');
    const secured = await sessions.revokeOthers();
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

  // Drop the ?error from the address bar once it has been read, so a reload does not re-announce it.
  useEffect(() => {
    if (googleLinkError) window.history.replaceState({}, '', '/account');
  }, [googleLinkError]);

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
                  {user.hasPassword
                    ? 'Finish by changing your password below. This device will stay signed in.'
                    : 'This device stayed signed in. Your Google account remains your sign-in method.'}
                </p>
                {!user.hasPassword && (
                  <button
                    type="button"
                    onClick={dismissSecurityReview}
                    className="mt-2 text-xs font-semibold text-accent hover:underline"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                New sign-in review
              </p>
              <h2 id="sign-in-review-heading" className="mt-1 text-base font-semibold text-ink">
                Was that sign-in you?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                If the device or location in the email looked wrong, lock every other session out
                now.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void secureAccount()}
                  disabled={securityReviewStatus === 'securing'}
                  className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {securityReviewStatus === 'securing' ? 'Securing account…' : 'That was not me'}
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

      {!changingPw && <AppLauncher />}

      {!changingPw && <hr className="my-6 border-line" />}

      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Profile</h2>
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
                className="btn-primary shrink-0 cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-semibold disabled:opacity-60"
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
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Sign-in & security
      </h2>
      <PasswordSection
        user={user}
        changingPw={changingPw}
        setChangingPw={setChangingPw}
        pwDone={pwDone}
        setPwDone={setPwDone}
        guard={stepUp.guard}
        onPasswordAdded={() => setUser({ ...user, hasPassword: true })}
        onFinished={() => securityReviewStatus === 'secured' && dismissSecurityReview()}
      />

      {googleEnabled && !changingPw && (
        <>
          <hr className="my-6 border-line" />
          <ConnectedAccounts
            user={user}
            googleMsg={googleMsg}
            setGoogleMsg={setGoogleMsg}
            guard={stepUp.guard}
            onDisconnected={() => setUser({ ...user, hasGoogle: false })}
          />
        </>
      )}

      {!changingPw && (
        <>
          <hr className="my-6 border-line" />
          <SessionList
            sessions={sessions}
            mountedAt={mountedAt}
            timeAgo={timeAgo}
            exactTime={exactTime}
          />
          <hr className="my-6 border-line" />
          <PasskeyList guard={stepUp.guard} />
          <hr className="my-6 border-line" />
          <ExportAccount />
        </>
      )}

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-6 min-h-11 w-full rounded-xl border border-line px-4 py-3 text-sm font-medium text-muted transition hover:border-accent hover:text-ink"
      >
        Log out
      </button>

      {!changingPw && <DeleteAccount user={user} />}

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
