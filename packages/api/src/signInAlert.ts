import type { SessionMeta } from './auth/session.js';

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

export function signInAlertHtml(meta: SessionMeta, accountUrl: string, at = new Date()): string {
  const device = escapeHtml(meta.device ?? 'Unknown device');
  const location = escapeHtml(meta.location ?? 'Location unavailable');
  const safeUrl = escapeHtml(accountUrl);
  const when = escapeHtml(at.toISOString());
  return `<p>A new device signed in to your aidenjang account.</p><p><strong>${device}</strong><br>${location}<br>${when}</p><p>If this was you, there is nothing to do. If not, <a href="${safeUrl}">review your active sessions</a> and sign out anything you do not recognize.</p>`;
}
