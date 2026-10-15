import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, authApi, googleEnabled, type AuthUser } from '../lib/api';
import { AccountShell } from '../components/AuthCard';
import { Skeleton } from '../components/Skeleton';
import { AccountProfile } from '../components/AccountProfile';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [changingPw, setChangingPw] = useState(
    () => new URLSearchParams(window.location.search).get('password') === 'change',
  );
  const [pwDone, setPwDone] = useState(false);
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

  useEffect(() => {
    let active = true;
    const checkAuth = (): void => {
      authApi
        .me()
        .then((r) => {
          if (active) {
            setUser(r.user);
            setLoadError(null);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (error instanceof ApiError && error.status === 401) {
            window.location.replace(`/login?return_to=${encodeURIComponent(window.location.href)}`);
          } else {
            setLoadError(
              error instanceof Error ? error.message : 'Could not load your account. Try again.',
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    checkAuth();
    // A bfcache restore can bring back the account screen after logout; verify before showing it.
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        setLoading(true);
        checkAuth();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      active = false;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [loadAttempt]);

  // Drop the ?error from the address bar once it has been read, so a reload does not re-announce it.
  useEffect(() => {
    if (googleLinkError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [googleLinkError]);

  function logout(): void {
    const login = `/login?return_to=${encodeURIComponent(window.location.href)}`;
    window.location.assign(
      `/logout?return_to=${encodeURIComponent(new URL(login, window.location.origin).href)}`,
    );
  }

  if (loadError && !loading) {
    return (
      <AccountShell title="Your account" subtitle="One login for all of aidenjang's apps.">
        <p role="alert" className="rounded-xl border border-neg/30 bg-neg/10 p-4 text-sm text-neg">
          {loadError}
        </p>
        <button
          type="button"
          className="btn-primary mt-4 rounded-xl px-5 py-3 font-semibold"
          onClick={() => {
            setLoading(true);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Try again
        </button>
      </AccountShell>
    );
  }

  if (loading) {
    return (
      <AccountShell title="Your account" subtitle="One login for all of aidenjang's apps.">
        <div className="space-y-3" role="status" aria-label="Loading your account">
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

      <AccountProfile user={user} onUserChange={setUser} />

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
        onClick={logout}
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
