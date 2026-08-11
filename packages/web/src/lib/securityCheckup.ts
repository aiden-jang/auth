import type { AuthUser, SessionInfo } from './api';

export type SecurityCheckState = 'pass' | 'action' | 'pending';
export type SecurityAction = 'verify_email' | 'add_password' | 'review_sessions';

export interface SecurityCheck {
  id: string;
  label: string;
  detail: string;
  state: SecurityCheckState;
  action?: SecurityAction;
}

export interface SecurityCheckup {
  score: number | null;
  label: 'Strong' | 'Good' | 'Needs attention' | 'Checking';
  checks: SecurityCheck[];
  nextAction: SecurityCheck | null;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** A transparent four-part checkup. Every missing point maps to a control on the account page. */
export function securityCheckup(
  user: Pick<AuthUser, 'emailVerified' | 'hasPassword' | 'hasGoogle'>,
  sessions: SessionInfo[] | null,
  now = Date.now(),
): SecurityCheckup {
  const otherSessions = sessions?.filter((session) => !session.current) ?? [];
  const needsReview = otherSessions.some((session) => {
    const lastSeen = new Date(session.lastSeenAt).getTime();
    return !session.device || Number.isNaN(lastSeen) || now - lastSeen > THIRTY_DAYS;
  });

  const checks: SecurityCheck[] = [
    user.emailVerified
      ? {
          id: 'email',
          label: 'Verified email',
          detail: 'Recovery messages can reach you.',
          state: 'pass',
        }
      : {
          id: 'email',
          label: 'Verify your email',
          detail: 'Confirm this address before you need it.',
          state: 'action',
          action: 'verify_email',
        },
    user.hasPassword || user.hasGoogle
      ? {
          id: 'access',
          label: 'Reliable sign-in',
          detail:
            user.hasPassword && user.hasGoogle
              ? 'Password and Google are both ready.'
              : user.hasGoogle
                ? 'Google and email links can get you in.'
                : 'Password and email links can get you in.',
          state: 'pass',
        }
      : {
          id: 'access',
          label: 'Add a password',
          detail: 'Email link is currently your only way in.',
          state: 'action',
          action: 'add_password',
        },
    sessions === null
      ? {
          id: 'count',
          label: 'Active devices',
          detail: 'Checking signed-in devices…',
          state: 'pending',
        }
      : sessions.length <= 3
        ? {
            id: 'count',
            label: 'Active devices',
            detail: `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} signed in.`,
            state: 'pass',
          }
        : {
            id: 'count',
            label: 'Too many active devices',
            detail: `${sessions.length} sessions deserve a quick look.`,
            state: 'action',
            action: 'review_sessions',
          },
    sessions === null
      ? {
          id: 'freshness',
          label: 'Session hygiene',
          detail: 'Checking recent activity…',
          state: 'pending',
        }
      : !needsReview
        ? {
            id: 'freshness',
            label: 'Sessions look familiar',
            detail: 'No stale or unnamed devices found.',
            state: 'pass',
          }
        : {
            id: 'freshness',
            label: 'Review an old device',
            detail: 'A stale or unnamed session is still active.',
            state: 'action',
            action: 'review_sessions',
          },
  ];

  const ready = checks.filter((check) => check.state === 'pass').length;
  const complete = checks.every((check) => check.state !== 'pending');
  const score = complete ? Math.round((ready / checks.length) * 100) : null;
  return {
    score,
    label:
      score === null
        ? 'Checking'
        : score === 100
          ? 'Strong'
          : score >= 75
            ? 'Good'
            : 'Needs attention',
    checks,
    nextAction: checks.find((check) => check.state === 'action') ?? null,
  };
}
