import {
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { authApi, type AuthUser, type Passkey } from './api';

/* Cancelling is normal, not an error: a red banner for a dismissed OS prompt teaches people the
 * button is broken. */

/** Cheap, synchronous, no prompt. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/** Whether this device could hold a passkey. Not whether anyone here has one. */
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

const USED_HERE_KEY = 'aidenjang:passkey-on-this-device';

/* WebAuthn cannot answer this: sign-in sends no allowCredentials, so a browser with no passkey
   offers a security key rather than saying no. A per-device note reveals nothing about the account. */
export function passkeyUsedOnThisDevice(): boolean {
  try {
    return window.localStorage.getItem(USED_HERE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberPasskeyOnThisDevice(): void {
  try {
    window.localStorage.setItem(USED_HERE_KEY, '1');
  } catch {
    // Private mode. Losing the hint costs an offer, never access.
  }
}

/** Whether the browser can offer a passkey from inside the email field, rather than as a prompt. */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await browserSupportsWebAuthnAutofill();
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
  // The browser has nothing it can use here. About the device, not the account, so it leaks nothing.

  if (err instanceof Error && err.name === 'NotSupportedError') {
    return {
      kind: 'error',
      message:
        'No passkey on this device. Sign in with your password, then add one from your account.',
    };
  }
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
    rememberPasskeyOnThisDevice();
    return { kind: 'ok', value: passkey };
  } catch (err) {
    return toOutcome(err);
  }
}

/** `autofill` offers this from the email field rather than as a prompt, so nobody without a
 *  passkey is interrupted by one. */
export async function signInWithPasskey({ autofill = false }: { autofill?: boolean } = {}): Promise<
  Outcome<AuthUser>
> {
  try {
    const { options } = await authApi.passkeyLoginOptions();
    const response = await startAuthentication({
      optionsJSON: options as never,
      useBrowserAutofill: autofill,
    });
    const { user } = await authApi.passkeyLoginVerify(response);
    rememberPasskeyOnThisDevice();
    return { kind: 'ok', value: user };
  } catch (err) {
    return toOutcome(err);
  }
}
