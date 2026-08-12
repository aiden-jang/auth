import { and, eq, lt } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { DB } from '../db/client.js';
import { credentials, users, webauthnChallenges } from '../db/schema.js';

/*
 * Passkeys.
 *
 * The verification itself is @simplewebauthn/server, deliberately. WebAuthn assertion checking is
 * signature verification over a hash of attacker-influenced bytes, with a list of things that must be
 * compared exactly and a couple that must not be; getting one of them subtly wrong produces a login
 * that works perfectly and accepts forgeries. That is not a thing to hand-roll on the front door to
 * somebody's whole account, so this file owns storage, policy and plumbing, and nothing else.
 *
 * What passkeys actually buy, and why they go first rather than in a settings screen: the stored
 * secret stops being a secret. `credentials.public_key` is public by construction, so a leak of that
 * table lets nobody sign in as anybody, and there is no shared string to phish, reuse, or forget.
 */

/** How long a started ceremony stays valid. Long enough to find the right finger, short enough to matter. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Cookie holding the id of the in-flight ceremony. Not the challenge: see webauthnChallenges. */
export const CHALLENGE_COOKIE = 'platform_webauthn';

export type PasskeyErrorCode =
  | 'NO_CHALLENGE'
  | 'CHALLENGE_EXPIRED'
  | 'VERIFICATION_FAILED'
  | 'UNKNOWN_CREDENTIAL'
  | 'ALREADY_REGISTERED'
  | 'NOT_FOUND'
  | 'COUNTER_REGRESSED';

export class PasskeyError extends Error {
  constructor(
    readonly code: PasskeyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PasskeyError';
  }
}

export interface RelyingParty {
  /** The registrable domain. A credential is bound to this and unusable anywhere else. */
  id: string;
  /** Shown in the platform's own prompt, so it is a product name and not a hostname. */
  name: string;
  /** Exact origin the ceremony must have come from. */
  origin: string;
}

/**
 * Where this service lives, from its own URL.
 *
 * The relying party id must be the registrable domain rather than the full host, or a credential made
 * on accounts.aidenjang.com would be unusable from anywhere else on the domain. It cannot be taken
 * from the request: a header the caller controls deciding which domain a credential is bound to is the
 * whole attack. So it is derived from APP_URL, which is configuration.
 */
export function relyingParty(appUrl: string | undefined, requestUrl: string): RelyingParty {
  const url = new URL(appUrl ?? requestUrl);
  const host = url.hostname;
  // localhost is special-cased by the spec and needs no eTLD handling.
  const id = host === 'localhost' ? 'localhost' : registrableDomain(host);
  return { id, name: 'aidenjang', origin: url.origin };
}

/**
 * The last two labels of a hostname.
 *
 * Correct for this service (aidenjang.com) and wrong in general: a real public-suffix list is the only
 * way to know that foo.co.uk is registrable and foo.com.au is not. Hard-coding the shape we deploy
 * beats shipping a 15KB suffix list to a Worker that serves exactly one domain, but it is a landmine
 * for anybody who points this at a multi-part TLD, so it says so out loud.
 */
function registrableDomain(host: string): string {
  const labels = host.split('.');
  return labels.length <= 2 ? host : labels.slice(-2).join('.');
}

/** Stash a challenge and return the id the cookie should carry. Also sweeps anything expired. */
async function stashChallenge(db: DB, challenge: string, userId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(webauthnChallenges).values({
    id,
    userId,
    challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  // Opportunistic cleanup: no cron needed for a table whose rows are all short-lived by definition.
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));
  return id;
}

/**
 * Consume a challenge. Always deletes it, whether or not it was usable.
 *
 * Single-use is the point. Deleting before verifying, rather than after success, means a response that
 * fails verification still burns its challenge, so an attacker cannot grind attempts against one.
 */
async function takeChallenge(db: DB, id: string | undefined): Promise<{ challenge: string; userId: string | null }> {
  if (!id) throw new PasskeyError('NO_CHALLENGE', 'That sign-in attempt expired. Try again.');
  const row = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, id)).get();
  if (row) await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
  if (!row) throw new PasskeyError('NO_CHALLENGE', 'That sign-in attempt expired. Try again.');
  if (row.expiresAt.getTime() < Date.now()) {
    throw new PasskeyError('CHALLENGE_EXPIRED', 'That took a while. Try again.');
  }
  return { challenge: row.challenge, userId: row.userId };
}

export interface PasskeyView {
  id: string;
  label: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(db: DB, userId: string): Promise<PasskeyView[]> {
  const rows = await db.select().from(credentials).where(eq(credentials.userId, userId));
  return rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      backedUp: row.backedUp,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Start adding a passkey to an account that is already signed in. */
export async function startRegistration(
  db: DB,
  rp: RelyingParty,
  user: { id: string; email: string; displayName: string },
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const existing = await db.select().from(credentials).where(eq(credentials.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email,
    userDisplayName: user.displayName,
    // Stops the same device silently making a second key for the same account, which would leave two
    // indistinguishable entries in the list and no way to tell which one to remove.
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      // Discoverable, because the whole promise is tapping one button without typing an email first.
      residentKey: 'required',
      // A passkey that does not confirm the human present is a bearer token in a keychain.
      userVerification: 'preferred',
    },
  });
  return { options, challengeId: await stashChallenge(db, options.challenge, user.id) };
}

/** Finish adding a passkey. Returns the stored row so the caller can log and label it. */
export async function finishRegistration(
  db: DB,
  rp: RelyingParty,
  userId: string,
  response: RegistrationResponseJSON,
  challengeId: string | undefined,
  label: string,
): Promise<PasskeyView> {
  const { challenge, userId: challengeUser } = await takeChallenge(db, challengeId);
  // The ceremony has to belong to the session finishing it, or a challenge started for one account
  // could be completed against another.
  if (challengeUser !== userId) throw new PasskeyError('NO_CHALLENGE', 'That attempt was not yours.');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
    });
  } catch {
    throw new PasskeyError('VERIFICATION_FAILED', 'That passkey could not be verified.');
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new PasskeyError('VERIFICATION_FAILED', 'That passkey could not be verified.');
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const already = await db.select().from(credentials).where(eq(credentials.id, credential.id)).get();
  if (already) throw new PasskeyError('ALREADY_REGISTERED', 'That passkey is already on an account.');

  await db.insert(credentials).values({
    id: credential.id,
    userId,
    // base64 rather than raw bytes: D1 columns are text, and this is a public key, not a secret.
    publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    backedUp: credentialBackedUp,
    transports: credential.transports?.join(',') ?? null,
    label: label.trim().slice(0, 40) || 'Passkey',
  });

  const stored = await db.select().from(credentials).where(eq(credentials.id, credential.id)).get();
  if (!stored) throw new PasskeyError('NOT_FOUND', 'Could not read that passkey back.');
  return {
    id: stored.id,
    label: stored.label,
    backedUp: stored.backedUp,
    createdAt: stored.createdAt.toISOString(),
    lastUsedAt: null,
  };
}

/**
 * Start a sign-in.
 *
 * No email, no `allowCredentials`. The authenticator offers whatever keys it holds for this domain and
 * tells us who it is afterwards, which is what makes "sign in" one tap. It also means this endpoint
 * reveals nothing: the options are identical whether or not any account exists.
 */
export async function startLogin(
  db: DB,
  rp: RelyingParty,
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'preferred',
  });
  return { options, challengeId: await stashChallenge(db, options.challenge, null) };
}

export interface PasskeyLogin {
  userId: string;
  email: string;
  label: string;
}

/** Finish a sign-in. Resolves the credential to its owner, or throws. */
export async function finishLogin(
  db: DB,
  rp: RelyingParty,
  response: AuthenticationResponseJSON,
  challengeId: string | undefined,
): Promise<PasskeyLogin> {
  const { challenge } = await takeChallenge(db, challengeId);

  const row = await db.select().from(credentials).where(eq(credentials.id, response.id)).get();
  if (!row) throw new PasskeyError('UNKNOWN_CREDENTIAL', 'That passkey is not registered here.');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(Buffer.from(row.publicKey, 'base64')),
        counter: row.counter,
        ...(row.transports ? { transports: row.transports.split(',') as never } : {}),
      },
      requireUserVerification: false,
    });
  } catch {
    throw new PasskeyError('VERIFICATION_FAILED', 'That passkey could not be verified.');
  }
  if (!verification.verified) throw new PasskeyError('VERIFICATION_FAILED', 'That passkey could not be verified.');

  /*
   * Cloning check.
   *
   * A counter that went backwards means two authenticators are answering for one credential, which is
   * the one signal WebAuthn gives that a key was copied. Only meaningful when the stored counter is
   * already above zero: most platform authenticators (Apple's included) always report zero, and
   * treating that as a regression would lock out the majority of real passkeys.
   */
  const next = verification.authenticationInfo.newCounter;
  if (row.counter > 0 && next <= row.counter) {
    throw new PasskeyError('COUNTER_REGRESSED', 'That passkey looks like a copy. Use another way in.');
  }

  await db
    .update(credentials)
    .set({ counter: next, lastUsedAt: new Date() })
    .where(eq(credentials.id, row.id));

  const owner = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).get();
  if (!owner) throw new PasskeyError('UNKNOWN_CREDENTIAL', 'That passkey is not registered here.');
  return { userId: row.userId, email: owner.email, label: row.label };
}

export async function renamePasskey(db: DB, userId: string, id: string, label: string): Promise<void> {
  const clean = label.trim().slice(0, 40);
  if (!clean) throw new PasskeyError('NOT_FOUND', 'Give it a name.');
  const row = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.id, id), eq(credentials.userId, userId)))
    .get();
  if (!row) throw new PasskeyError('NOT_FOUND', 'That passkey is already gone.');
  await db.update(credentials).set({ label: clean }).where(eq(credentials.id, id));
}

/**
 * Remove a passkey.
 *
 * Scoped to the owner, so an id guessed from somewhere else deletes nothing. Deliberately allowed to
 * remove the last one: an account always keeps the emailed link as a way in, so this cannot strand
 * anybody, and refusing would make a lost device impossible to clean up.
 */
export async function deletePasskey(db: DB, userId: string, id: string): Promise<void> {
  const row = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.id, id), eq(credentials.userId, userId)))
    .get();
  if (!row) throw new PasskeyError('NOT_FOUND', 'That passkey is already gone.');
  await db.delete(credentials).where(eq(credentials.id, id));
}
