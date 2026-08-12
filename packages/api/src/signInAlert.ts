import type { SessionMeta } from './auth/session.js';
import { readableTime, renderEmail, type RenderedEmail } from './emailLayout.js';

export interface SignInFingerprint {
  device: string | null;
  location: string | null;
  createdAt: Date;
}

const FAMILIAR_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/** A sign-in is familiar only when the same coarse device and location appeared recently. */
export function isFamiliarSignIn(
  recent: SignInFingerprint[],
  meta: SessionMeta,
  now = Date.now(),
): boolean {
  return recent.some((event) =>
    event.device === (meta.device ?? null) &&
    event.location === (meta.location ?? null) &&
    now - event.createdAt.getTime() <= FAMILIAR_FOR_MS,
  );
}

export function signInAlertEmail(meta: SessionMeta, accountUrl: string, at = new Date()): RenderedEmail {
  return renderEmail({
    preheader: 'A device you have not used before signed in. If it was not you, sign it out.',
    heading: 'A new device signed in',
    paragraphs: [
      'Someone signed in to your aidenjang account from a device we have not seen recently.',
      'If this was you, there is nothing to do.',
      'If it was not, sign that device out and change your password.',
    ],
    facts: [
      { label: 'Device', value: meta.device ?? 'Unknown device' },
      { label: 'Location', value: meta.location ?? 'Location unavailable' },
      { label: 'When', value: readableTime(at) },
    ],
    action: { label: 'Review your devices', url: accountUrl },
  });
}
