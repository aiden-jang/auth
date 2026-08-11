import type { AuthUser } from './api';

export type RecoveryScenario = 'locked_out' | 'lost_method' | 'unfamiliar_device';

export interface RecoveryStep {
  title: string;
  detail: string;
}

export interface RecoveryPlan {
  title: string;
  intro: string;
  steps: RecoveryStep[];
  actionLabel: string;
  actionHref?: string;
  action: 'navigate' | 'review_sessions' | 'verify_email';
}

export const RECOVERY_SCENARIOS: Array<{ id: RecoveryScenario; label: string }> = [
  { id: 'locked_out', label: 'Forgot password' },
  { id: 'lost_method', label: 'Lost a sign-in method' },
  { id: 'unfamiliar_device', label: 'Unknown device' },
];

/** Personalized recovery routes using only sign-in methods the account actually has. */
export function recoveryPlan(
  user: Pick<AuthUser, 'email' | 'emailVerified' | 'hasPassword' | 'hasGoogle'>,
  scenario: RecoveryScenario,
  activeSessions = 0,
): RecoveryPlan {
  if (scenario === 'unfamiliar_device') {
    return {
      title: 'Lock down an unfamiliar sign-in',
      intro: `${activeSessions || 'No'} active ${activeSessions === 1 ? 'session is' : 'sessions are'} currently listed. Keep this device and remove anything you do not recognize.`,
      steps: [
        { title: 'Open active devices', detail: 'Compare the device name, approximate location, and last activity.' },
        { title: 'Sign it out', detail: 'Revoke the unfamiliar session, or sign out every other device in one tap.' },
        {
          title: user.hasPassword ? 'Change your password' : 'Protect your sign-in provider',
          detail: user.hasPassword
            ? 'Changing it rotates every remaining session except this one.'
            : 'Review your Google account security because it is one of your sign-in methods.',
        },
      ],
      actionLabel: 'Review active devices',
      action: 'review_sessions',
    };
  }

  if (scenario === 'lost_method') {
    const alternate = user.hasGoogle
      ? 'Continue with Google'
      : user.hasPassword
        ? 'your password'
        : 'an email sign-in link';
    return {
      title: 'Use your other way in',
      intro: `If your usual method is unavailable, ${alternate} can still reach this account.`,
      steps: [
        { title: 'Go to sign in', detail: `Use ${alternate} for ${user.email}.` },
        {
          title: 'Recover the missing method',
          detail: user.hasGoogle && user.hasPassword
            ? 'Once inside, both Google and password access can be reviewed independently.'
            : 'Once inside, add a second sign-in method so one outage cannot lock you out.',
        },
        { title: 'Review active devices', detail: 'Remove any old sessions before you finish.' },
      ],
      actionLabel: 'Open sign in',
      actionHref: '/login',
      action: 'navigate',
    };
  }

  return {
    title: 'Recover a forgotten password',
    intro: user.emailVerified
      ? `A recovery message can be sent to ${user.email}.`
      : `Verify ${user.email} now so password recovery is dependable later.`,
    steps: [
      {
        title: user.emailVerified ? 'Request a reset link' : 'Verify your email first',
        detail: user.emailVerified
          ? 'Start from the forgot-password page and use the newest email you receive.'
          : 'An unverified inbox is not a recovery plan. Confirm it from this account page.',
      },
      { title: 'Choose a new password', detail: 'Use a unique password you have not used on another site.' },
      { title: 'Check your devices', detail: 'A reset signs old sessions out; confirm only your current devices return.' },
    ],
    actionLabel: user.emailVerified ? 'Open password recovery' : 'Verify email first',
    ...(user.emailVerified ? { actionHref: '/forgot-password' } : {}),
    action: user.emailVerified ? 'navigate' : 'verify_email',
  };
}

export function recoveryPlanText(
  user: Pick<AuthUser, 'email' | 'emailVerified' | 'hasPassword' | 'hasGoogle'>,
  plan: RecoveryPlan,
  generatedAt = new Date(),
): string {
  const methods = [user.hasPassword && 'password', user.hasGoogle && 'Google', 'email sign-in link'].filter(Boolean).join(', ');
  return [
    'AIDENJANG ACCOUNT RECOVERY PLAN',
    `Saved: ${generatedAt.toISOString()}`,
    `Account: ${user.email}`,
    `Email verified: ${user.emailVerified ? 'yes' : 'no'}`,
    `Sign-in methods: ${methods}`,
    '',
    plan.title,
    plan.intro,
    '',
    ...plan.steps.flatMap((step, index) => [`${index + 1}. ${step.title}`, `   ${step.detail}`]),
    '',
    'Start at: https://accounts.aidenjang.com/login',
    'This file is a checklist, not a key. It contains no password, session, or recovery token.',
    '',
  ].join('\n');
}
