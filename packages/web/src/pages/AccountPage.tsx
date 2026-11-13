import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, authApi, googleEnabled, type AuthUser } from '../lib/api';
import { AccountShell } from '../components/AccountShell';
import { AccountNavigation } from '../components/AccountNavigation';
import { SecurityReview } from '../components/SecurityReview';
import { useAccountNavigation } from '../lib/useAccountNavigation';
import { AccountIcon } from '../components/AccountIcon';
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
import { safeReturnTo } from '../lib/returnTo';
import { SESSION_CHANGE_CHANNEL } from '../lib/sessionChanges';

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
  const sessions = useSessions();
  const navigation = useAccountNavigation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [changingPw, updateChangingPw] = useState(
    () => new URLSearchParams(window.location.search).get('password') === 'change',
  );
  const stepUp = useStepUp(user, changingPw ? '/account?password=change' : '/account');
  const verificationReturnTo = safeReturnTo(
    new URLSearchParams(window.location.search).get('verify_return_to'),
  );

  function updateUser(change: Partial<AuthUser>): void {
    setUser((current) => (current ? { ...current, ...change } : current));
  }

  function setChangingPw(open: boolean): void {
    navigation.select('signin', true);
    updateChangingPw(open);
    if (!open) {
      const url = new URL(window.location.href);
      url.searchParams.delete('password');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }
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
  const [securityReviewStatus, setSecurityReviewStatus] = useState<
    'securing' | 'secured' | 'failed' | null
  >(null);

  function dismissSecurityReview(): void {
    setSecurityReview(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('security');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function secureAccount(): Promise<void> {
    if (!user || sessions.revokingOthers) return;
    setSecurityReviewStatus('securing');
    const secured = await sessions.revokeOthers({ reportError: false });
    if (!secured) {
      setSecurityReviewStatus('failed');
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
    let accountId: string | undefined;
    const redirectIfSignedOut = (error: unknown): boolean => {
      if (!(error instanceof ApiError) || error.status !== 401) return false;
      window.location.replace(`/login?return_to=${encodeURIComponent(window.location.href)}`);
      return true;
    };
    const checkAuth = (): void => {
      authApi
        .me()
        .then((r) => {
          if (active) {
            accountId = r.user.id;
            setUser(r.user);
            setLoadError(null);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (!redirectIfSignedOut(error)) {
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
    const checkSession = (): void => {
      // A background check must never replace profile or sign-in changes being saved here.
      void authApi
        .me()
        .then(({ user: current }) => {
          if (active && accountId && current.id !== accountId) window.location.reload();
        })
        .catch((error: unknown) => {
          if (active) redirectIfSignedOut(error);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') checkSession();
    };
    const sessionChanges =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANGE_CHANNEL);
    sessionChanges?.addEventListener('message', checkSession);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      sessionChanges?.close();
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAttempt]);

  // Drop the ?error from the address bar once it has been read, so a reload does not re-announce it.
  useEffect(() => {
    if (googleLinkError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('reason');
      url.hash = 'account-security';
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
    <AccountShell
      title={navigation.selected.title}
      subtitle={navigation.selected.subtitle}
      navigation={<AccountNavigation navigation={navigation} />}
      identity={
        <div className="hub-identity">
          <span className="account-avatar" aria-hidden>
            {Array.from(user.displayName).slice(0, 2).join('')}
          </span>
          <div>
            <strong>{user.displayName}</strong>
            <p>{user.email}</p>
          </div>
        </div>
      }
      action={
        <button type="button" onClick={logout} className="hub-logout">
          <AccountIcon kind="logout" />
          Log out
        </button>
      }
    >
      {stepUp.prompt}
      {securityReview && (
        <SecurityReview
          status={securityReviewStatus}
          hasPassword={user.hasPassword}
          busy={sessions.revokingOthers}
          onDismiss={dismissSecurityReview}
          onSecure={secureAccount}
        />
      )}

      <div hidden={navigation.selected.id !== 'apps'}>
        <AppLauncher />
      </div>

      <div hidden={navigation.selected.id !== 'profile'}>
        <AccountProfile
          user={user}
          onUserChange={updateUser}
          verificationReturnTo={verificationReturnTo}
        />
      </div>

      <section
        hidden={navigation.selected.id !== 'signin'}
        id="account-security"
        className="hub-section"
        aria-labelledby="account-security-heading"
      >
        <h2 id="account-security-heading" className="sr-only">
          Sign-in & security
        </h2>
        <PasswordSection
          user={user}
          changingPw={changingPw}
          setChangingPw={setChangingPw}
          pwDone={pwDone}
          setPwDone={setPwDone}
          guard={stepUp.guard}
          onPasswordAdded={() => updateUser({ hasPassword: true })}
          onFinished={() => securityReviewStatus === 'secured' && dismissSecurityReview()}
        />

        {googleEnabled && !changingPw && (
          <ConnectedAccounts
            user={user}
            googleMsg={googleMsg}
            setGoogleMsg={setGoogleMsg}
            guard={stepUp.guard}
            onDisconnected={() => updateUser({ hasGoogle: false })}
          />
        )}
        {!changingPw && <PasskeyList guard={stepUp.guard} />}
      </section>

      <div hidden={navigation.selected.id !== 'devices'}>
        <SessionList
          sessions={sessions}
          mountedAt={mountedAt}
          timeAgo={timeAgo}
          exactTime={exactTime}
        />
      </div>
      <div hidden={navigation.selected.id !== 'data'}>
        <ExportAccount />
        <DeleteAccount user={user} guard={stepUp.guard} />
      </div>
    </AccountShell>
  );
}
