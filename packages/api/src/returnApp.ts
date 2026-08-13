/*
 * Which app somebody was trying to reach, for the footer line that explains why they got the email.
 *
 * Resolved here from the URL's hostname, never taken as a name the client sent. The result is printed
 * in an email, and "you are getting this because someone used this address to sign in to your bank"
 * is the exact sentence a phisher would want to put there.
 *
 * Derived from the subdomain rather than matched against a list of apps, so a new app under the hub
 * reads correctly without a matching entry here to forget.
 */

const ROOT = 'aidenjang.com';

/** Hosts that are not an app: signing in at the accounts page is not signing in "to accounts". */
const RESERVED = new Set(['accounts', 'www', 'api']);

/** A DNS label, so nothing shaped unlike an app name can reach the copy. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function returnAppName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host: string;
  try {
    // No base URL on purpose: a relative target is somewhere on the auth app itself, not an app.
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.endsWith(`.${ROOT}`)) return null;
  const label = host.slice(0, -(ROOT.length + 1));
  // A dot left in the label means a deeper subdomain, which is not one of the apps.
  if (label.includes('.') || RESERVED.has(label) || !LABEL.test(label)) return null;
  return label;
}
