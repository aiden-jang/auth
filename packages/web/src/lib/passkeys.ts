import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { authApi, type AuthUser, type Passkey } from './api';

/*
 * The browser half of a passkey ceremony.
 *
 * All of it lives here because the interesting part is not the happy path, it is that *cancelling is
 * normal*. Somebody taps "sign in with a passkey", the operating system throws up a prompt, and they
 * think better of it or use the wrong finger. That is not an error to report, and showing "NotAllowedError"
 * or a red banner for it teaches people that the button is broken.
 */

/** Whether this browser can do passkeys at all. Cheap, synchronous, no prompt. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * Whether the platform will offer a passkey without the user hunting for one.
 *
 * Distinct from mere support: a desktop Chrome with no platform authenticator can technically do
 * WebAuthn via a USB key, and offering "sign in with a passkey" as the primary action there sends most
 * people into a dead end. Async because it asks the platform, and defensive because the method is
 * recent enough that not every browser has it.
 */
export async function passkeysLikely(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
    return available !== false;
  } catch {
    return false;
  }
}

/**
 * The user closed the prompt, or the platform declined without an explanation.
 *
 * WebAuthn deliberately collapses "you cancelled", "no key matched" and "the timeout passed" into one
 * NotAllowedError so a site cannot probe which credentials exist. That privacy property means we cannot
 * tell a cancel from a miss, so both are treated as "nothing happened", which is the honest reading.
 */
export function wasCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}

/** A ceremony outcome: it worked, the person backed out, or something genuinely went wrong. */
export type Outcome<T> = { kind: 'ok'; value: T } | { kind: 'cancelled' } | { kind: 'error'; message: string };

function toOutcome(err: unknown): Outcome<never> {
  if (wasCancelled(err)) return { kind: 'cancelled' };
  // InvalidStateError means this device already has a key for this account, which is a sentence worth
  // saying rather than a code worth showing.
  if (err instanceof Error && err.name === 'InvalidStateError') {
    return { kind: 'error', message: 'This device already has a passkey for your account.' };
  }
  return { kind: 'error', message: err instanceof Error ? err.message : 'That did not work.' };
}

/** Add a passkey to the signed-in account. */
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

/**
 * Sign in with a passkey. No email needed: the authenticator knows which accounts it holds.
 *
 * That is the whole reason this goes first on the sign-in page. There is nothing to type, nothing to
 * remember, and nothing on the server worth stealing.
 */
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
