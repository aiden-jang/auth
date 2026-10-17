import type { SessionMeta } from './auth/session.js';
import { escapeHtml, readableTime, renderEmail, type RenderedEmail } from './emailLayout.js';

// Alert on every credential change. Delivery failures must not prevent securing the account.

export type CredentialChange =
  | 'password_added'
  | 'password_changed'
  | 'google_disconnected'
  | 'passkey_added'
  | 'passkey_removed';

/** Every change that must reach the owner's inbox, so a test can walk the whole set. */
export const CREDENTIAL_CHANGES = [
  'password_added',
  'password_changed',
  'google_disconnected',
  'passkey_added',
  'passkey_removed',
] as const satisfies readonly CredentialChange[];

interface Copy {
  subject: string;
  /** Completes "Someone ___ on your aidenjang account." */
  happened: string;
  /** What the owner should do if it was not them, beyond the standard advice. */
  ifNotYou: string;
}

const COPY: Record<CredentialChange, Copy> = {
  password_added: {
    subject: 'A password was added to your account',
    happened: 'added a password to your aidenjang account, which until now signed in with Google',
    ifNotYou: 'change that password immediately, then sign out every other device.',
  },
  password_changed: {
    subject: 'Your password changed',
    happened: 'changed the password on your aidenjang account',
    ifNotYou: 'reset your password from the sign-in page, then sign out every other device.',
  },
  google_disconnected: {
    subject: 'Google was unlinked from your account',
    happened:
      'unlinked Google from your aidenjang account, so it now signs in with a password only',
    ifNotYou: 'reset your password from the sign-in page, then link Google again.',
  },
  passkey_added: {
    subject: 'A passkey was added to your account',
    happened: 'added a passkey to your aidenjang account, which can sign in without your password',
    ifNotYou:
      'remove any passkey you do not recognise, then change your password and sign out every other device.',
  },
  passkey_removed: {
    subject: 'A passkey was removed from your account',
    happened: 'removed a passkey from your aidenjang account',
    ifNotYou:
      'sign out every other device, then add a fresh passkey and remove any you do not recognise.',
  },
};

export function credentialAlertSubject(kind: CredentialChange): string {
  return COPY[kind].subject;
}

export function credentialAlertEmail(
  kind: CredentialChange,
  meta: SessionMeta,
  accountUrl: string,
  at = new Date(),
): RenderedEmail {
  const copy = COPY[kind];
  return renderEmail({
    reason: 'alert',
    // The preview line answers the only question that matters before opening it.
    preheader: `${copy.subject}. If that was not you, act now.`,
    heading: copy.subject,
    paragraphs: [
      `Someone ${escapeHtml(copy.happened)}.`,
      `If that was you, there is nothing to do.`,
      `If it was not, ${escapeHtml(copy.ifNotYou)}`,
    ],
    // Device, place and time are the three things that let somebody recognise their own action, so they
    // get their own labelled block rather than being run together in a sentence.
    facts: [
      { label: 'Device', value: meta.device ?? 'Unknown device' },
      { label: 'Location', value: meta.location ?? 'Location unavailable' },
      { label: 'When', value: readableTime(at) },
    ],
    action: { label: 'Review your account', url: accountUrl },
  });
}
