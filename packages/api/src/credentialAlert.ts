import type { SessionMeta } from './auth/session.js';

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

export function credentialAlertHtml(
  kind: CredentialChange,
  meta: SessionMeta,
  accountUrl: string,
  at = new Date(),
): string {
  const copy = COPY[kind];
  const device = escapeHtml(meta.device ?? 'Unknown device');
  const location = escapeHtml(meta.location ?? 'Location unavailable');
  const safeUrl = escapeHtml(accountUrl);
  const when = escapeHtml(at.toISOString());
  return (
    `<p>Someone ${copy.happened}.</p>` +
    `<p><strong>${device}</strong><br>${location}<br>${when}</p>` +
    `<p>If that was you, you are done here. If it was not, ${copy.ifNotYou} ` +
    `You can do both from <a href="${safeUrl}">your account page</a>.</p>`
  );
}
