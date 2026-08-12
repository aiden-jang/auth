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
 * Storage, policy and plumbing only. Verification is @simplewebauthn/server on purpose: a subtly wrong
 * assertion check produces a login that works perfectly and accepts forgeries.
 */

/** How long a started ceremony stays valid. */
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
  /** A credential is bound to this and unusable anywhere else. */
  id: string;
  /** Shown in the platform's own prompt, so a product name and not a hostname. */
  name: string;
  origin: string;
}

/**
 * From APP_URL, never the request: a caller-controlled header choosing which domain a credential binds
 * to is the whole attack. Registrable domain, not the host, or the credential works on one subdomain.
 */
export function relyingParty(appUrl: string | undefined, requestUrl: string): RelyingParty {
  const url = new URL(appUrl ?? requestUrl);
  const host = url.hostname;
  // localhost is special-cased by the spec and needs no eTLD handling.
  const id = host === 'localhost' ? 'localhost' : registrableDomain(host);
  return { id, name: 'aidenjang', origin: url.origin };
}

/**
 * Last two labels. Correct for aidenjang.com and wrong for any multi-part TLD (foo.co.uk), which needs
 * a real public-suffix list. A landmine if this is ever pointed at one.
 */
function registrableDomain(host: string): string {
  const labels = host.split('.');
  return labels.length <= 2 ? host : labels.slice(-2).join('.');
}

/** Returns the id the cookie should carry. Also sweeps anything expired. */
async function stashChallenge(db: DB, challenge: string, userId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(webauthnChallenges).values({
    id,
    userId,
    challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  // Opportunistic: no cron needed for a table of short-lived rows.
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()));
  return id;
}

/** Deletes before verifying, not after success, so a failed response still burns its challenge. */
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
    // Or the same device makes a second, indistinguishable key with no way to tell them apart.
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      // Discoverable: the promise is one tap without typing an email first.
      residentKey: 'required',
      // Without this a passkey is a bearer token in a keychain.
      userVerification: 'preferred',
    },
  });
  return { options, challengeId: await stashChallenge(db, options.challenge, user.id) };
}

/** Returns the stored row so the caller can log and label it. */
export async function finishRegistration(
  db: DB,
  rp: RelyingParty,
  userId: string,
  response: RegistrationResponseJSON,
  challengeId: string | undefined,
  label: string,
): Promise<PasskeyView> {
  const { challenge, userId: challengeUser } = await takeChallenge(db, challengeId);
  // Or a challenge started for one account could be completed against another.
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
    // base64: D1 columns are text, and this is a public key, not a secret.
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

/** No email and no `allowCredentials`, so the options are identical whether or not an account exists. */
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

  // Cloning check, and only when the stored counter is above zero: Apple's authenticators always
  // report zero, so treating that as a regression locks out most real passkeys.
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
 * Scoped to the owner, so a guessed id deletes nothing. Deliberately allows removing the last one:
 * the emailed link is always a way in, and refusing makes a lost device impossible to clean up.
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
