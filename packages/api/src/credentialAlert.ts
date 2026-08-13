import type { SessionMeta } from './auth/session.js';
import { escapeHtml, readableTime, renderEmail, type RenderedEmail } from './emailLayout.js';

/*
 * "Your sign-in method changed" mail.
 *
 * This is the safety net that does not depend on us reasoning correctly about attack paths. Every
 * other control here is a guess about what an attacker can reach; a message in the owner's inbox is
 * the one thing that still works when a guess is wrong. So it is sent for every credential change,
 * unconditionally, and never gated on the change looking suspicious.
 *
 * It is also why the send is best-effort at the call site. A mail provider being down must not stop
 * someone changing their password, especially not when they are changing it because they think
 * somebody else has it.
 */

export type CredentialChange = 'password_added' | 'password_changed' | 'google_disconnected' | 'passkey_removed';

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
    happened: 'unlinked Google from your aidenjang account, so it now signs in with a password only',
    ifNotYou: 'reset your password from the sign-in page, then link Google again.',
  },
  passkey_removed: {
    subject: 'A passkey was removed from your account',
    happened: 'removed a passkey from your aidenjang account',
    ifNotYou: 'sign out every other device, then add a fresh passkey and remove any you do not recognise.',
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
