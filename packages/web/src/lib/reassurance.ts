/**
 * What to say while somebody waits.
 *
 * Signing in is the one moment in the whole platform where a person is actively wondering whether to
 * trust it, and a bare spinner spends that moment saying nothing. This fills it.
 *
 * The rule that makes this reassurance rather than theatre: **every line is a true, specific claim about
 * this implementation.** No "we take your security seriously", no "bank-grade encryption", nothing that
 * would survive being pasted into a different product. Each one is checkable against the code, and the
 * comments below say where. Vague security copy is worse than a spinner, because it teaches people that
 * the words in these places mean nothing.
 */

export type WaitingOn =
  | 'password-login'
  | 'passkey'
  | 'magic-link'
  | 'reset-link'
  | 'verify-email'
  | 'sessions'
  | 'activity'
  | 'signup'
  | 'reauth';

/**
 * One line per waiting moment.
 *
 * Deliberately one and not a rotating set. Cycling messages under a spinner reads as filler designed to
 * make a wait feel shorter, which is the opposite of the intent, and it makes each line feel less like a
 * fact about the system.
 */
const LINES: Record<WaitingOn, string> = {
  // auth/password.ts: PBKDF2-HMAC-SHA256, 100k iterations, per-password random salt. The stored value
  // is the derived hash, so the original is never written down anywhere.
  'password-login': 'Checking against a salted hash. Your actual password is never stored.',

  // auth/passkeys.ts: only the public key is stored, and the private half never leaves the authenticator.
  passkey: 'Your device is proving it is you. The secret half never leaves it.',

  // auth/verification.ts consumeToken deletes the row on use, and issueToken sets a short expiry.
  'magic-link': 'Building a link that works once and then expires.',
  'reset-link': 'Building a link that works once and then expires.',
  'verify-email': 'Checking the link. It only works once, which is why it cannot be reused.',

  // db/schema.ts sessions: a parsed device label and a coarse city, deliberately never an IP address
  // or a raw user agent.
  sessions: 'Reading your devices. We keep a rough city, never an IP address.',

  // db/schema.ts securityEvents carries the same restriction, and the type list is an allowlist.
  activity: 'Loading your history. It records what happened, not where you were.',

  // index.ts register: the account is created and the session issued in one go, nothing is queued.
  signup: 'Setting up your account. One login covers every app.',

  // auth/stepUp.ts: the confirmation opens a short window rather than being remembered.
  reauth: 'Confirming it is you. This stays confirmed for a few minutes, not forever.',
};

export function reassurance(waitingOn: WaitingOn): string {
  return LINES[waitingOn];
}

/**
 * Every line, for the test that keeps them honest.
 *
 * Exported so a test can assert the whole set avoids the vocabulary that makes security copy meaningless.
 * Without that, the first person in a hurry adds "bank-grade" and nothing catches it.
 */
export const ALL_REASSURANCE = Object.entries(LINES) as [WaitingOn, string][];
