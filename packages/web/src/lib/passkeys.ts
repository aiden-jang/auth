import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { authApi, type AuthUser, type Passkey } from './api';

/* Cancelling is normal, not an error: a red banner for a dismissed OS prompt teaches people the
 * button is broken. */

/** Cheap, synchronous, no prompt. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * Not the same as support: a desktop Chrome with no platform authenticator can do WebAuthn over USB,
 * and making that the primary action is a dead end for most people.
 */
export async function passkeysLikely(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
    return available !== false;
  } catch {
    return false;
  }
}

/** WebAuthn collapses cancel, no-match and timeout into one NotAllowedError so a site cannot probe
 *  which credentials exist, so we genuinely cannot tell them apart. */
function wasCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}

export type Outcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function toOutcome(err: unknown): Outcome<never> {
  if (wasCancelled(err)) return { kind: 'cancelled' };
  // InvalidStateError means this device already has a key for this account.
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return { kind: 'error', message: 'This device already has a passkey for your account.' };
  }
  return { kind: 'error', message: err instanceof Error ? err.message : 'That did not work.' };
}

export async function addPasskey(label?: string): Promise<Outcome<Passkey>> {
  try {
    const { options } = await authApi.passkeyRegisterOptions();
    const response = await startRegistration({ optionsJSON: options as never });
    const { passkey } = await authApi.passkeyRegisterVerify(response, label);
    return { kind: 'ok', value: passkey };
  } catch (err) {
    return toOutcome(err);
  }
}

/** No email needed: the authenticator knows which accounts it holds. */
export async function signInWithPasskey(): Promise<Outcome<AuthUser>> {
  try {
    const { options } = await authApi.passkeyLoginOptions();
    const response = await startAuthentication({ optionsJSON: options as never });
    const { user } = await authApi.passkeyLoginVerify(response);
    return { kind: 'ok', value: user };
  } catch (err) {
    return toOutcome(err);
  }
}
