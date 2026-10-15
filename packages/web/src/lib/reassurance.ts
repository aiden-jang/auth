/* Every line is a specific claim about this implementation, and the comment under it names where
   to check. Nothing that would survive being pasted into a different product. */

export type WaitingOn =
  'password-login' | 'passkey' | 'reset-link' | 'verify-email' | 'sessions' | 'signup' | 'reauth';

/** One line each, not a rotating set: cycling copy reads as filler rather than as a fact. */
const LINES: Record<WaitingOn, string> = {
  // auth/password.ts: PBKDF2-HMAC-SHA256, 100k iterations, per-password random salt. The stored value
  // is the derived hash, so the original is never written down anywhere.
  'password-login': 'Checking against a salted hash. Your actual password is never stored.',

  // auth/passkeys.ts: only the public key is stored, and the private half never leaves the authenticator.
  passkey: 'Your device is proving it is you. The secret half never leaves it.',

  // auth/verification.ts consumeToken deletes the row on use, and issueToken sets a short expiry.
  'reset-link': 'Building a link that works once and then expires.',
  'verify-email': 'Checking the link. It only works once, which is why it cannot be reused.',

  // db/schema.ts sessions: a parsed device label and a coarse city, deliberately never an IP address
  // or a raw user agent.
  sessions: 'Reading your devices. We keep a rough city, never an IP address.',

  // index.ts register: the account is created and the session issued in one go, nothing is queued.
  signup: 'Setting up your account. One login covers every app.',

  // auth/stepUp.ts: the confirmation opens a short window rather than being remembered.
  reauth: 'Confirming it is you. This stays confirmed for a few minutes, not forever.',
};

export function reassurance(waitingOn: WaitingOn): string {
  return LINES[waitingOn];
}

/** Exported so a test can catch the first person who adds "bank-grade". */
export const ALL_REASSURANCE = Object.entries(LINES) as [WaitingOn, string][];
