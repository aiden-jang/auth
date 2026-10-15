# Security posture

What Accounts enforces and where its trust boundary ends.

Report vulnerabilities through [private reporting](https://github.com/aiden-jang/auth/security/advisories/new). Do not include session cookies, passwords, email links, or account exports in public issues.

GitHub runs dependency, CodeQL, and secret scans, with push protection enabled. Full dependency auditing is also a required CI gate.

## Identity & sessions

- Passwords hashed (never stored plaintext); registration gated by Cloudflare Turnstile.
- Session is an httpOnly, `Secure`, `SameSite=Lax` cookie `platform_session` scoped to
  `.aidenjang.com`. Apps never read it in the browser; they validate server-side by forwarding
  the cookie to the auth service's `/auth/me` (`resolveSession`).
- An app must not read an outage as a sign-out. `/auth/me` failing means the session is unproven,
  not absent: treat `unavailable` as "keep them as they were". `getSessionUser` cannot tell the two
  apart, so apps still on it read an outage as signed out.
- Per-IP rate limiting on auth actions (login/register/verify) via a Durable Object.

## Step-up re-authentication

A session cookie proves who you were when you signed in, not that you are still at the keyboard.
Anything that changes how the account can be signed into afterwards needs a session that proved
itself within the last 10 minutes (`SUDO_WINDOW_MS`), and answers `403 REAUTH_REQUIRED` otherwise.
The window runs from the last proof, never extended by activity, and a window that ordinary use
extended would never close for a stolen cookie either.

Behind the gate: adding a passkey, removing a passkey, setting a password on a passwordless
account, unlinking Google, and deleting a passwordless account.

Adding a passkey belongs there for a reason worth stating: changing a password revokes every
session but does not remove credentials, so a passkey registered by somebody else keeps working
after the owner has done everything they were told to do.

Changing a password is not gated: it asks for the current password, which is the same proof.
Deleting an account that has a password asks for that password. Reading, renaming and signing
other devices out are not gated; gating ordinary use would make the window a nuisance rather than
a defence.

## Transport & response headers

Every web-facing Worker sets a common set of headers through `harden()`. There is no shared
package: each app carries its own copy, so a Worker never depends on this one being deployed to be
served safely. This repo's lives in `packages/api/src/harden.ts`, which is the reference version.

| Header                      | Value / intent                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'` baseline; `script-src 'self'` (no inline scripts in prod bundles); `style-src 'unsafe-inline'` for React/Vite styles; images `data:`/`blob:`; Google Fonts allowed; `frame-ancestors 'none'`; `upgrade-insecure-requests` |
| `Strict-Transport-Security` | 2 years, `includeSubDomains; preload`                                                                                                                                                                                                          |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                      |
| `X-Frame-Options`           | `DENY` (clickjacking; belt-and-suspenders with `frame-ancestors`)                                                                                                                                                                              |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                              |
| `Permissions-Policy`        | camera/mic/geolocation/payment/usb off by default (wherever overrides to allow geolocation)                                                                                                                                                    |

The CSP is intentionally conservative so the SPAs run unchanged; tighten per app after
browser-verifying on deploy. Anything cross-origin a specific app needs goes through the `csp`
override rather than loosening the shared default.

## CSRF

- **Primary defense:** `SameSite=Lax` stops the browser from attaching the session cookie to
  cross-site state-changing requests, so a forged POST from another origin is unauthenticated.
- **Defense-in-depth:** each app's inlined `enforceSameOrigin()` rejects any state-changing request
  whose `Origin` header is present and points at an unapproved host. Accounts accepts its own UI
  origin and explicitly configured app origins; an absent allowlist never reflects an arbitrary
  origin. Server-to-server calls without Origin remain supported.

## Dependencies

- `.github/dependabot.yml`: weekly npm (workspace-wide) + GitHub Actions updates, minor/patch
  grouped; major upgrades are reviewed deliberately.
- CI (`.github/workflows/ci.yml`) requires repository/unit/build checks and browser journeys; deployment reuses the verified web artifact after D1 migrations succeed.

## Known gaps / follow-ups

- Registration answers `409 EMAIL_TAKEN`, which does tell a caller whether an address has an
  account. Accepted deliberately: the alternative makes sign-up unusable. Successful `forgot-password` requests return the same `200` response for known and unknown addresses.
- The passkey ceremonies have no test that completes one. Doing so needs a software authenticator
  to sign a real attestation, so `finishRegistration` and `finishLogin` are covered up to the point
  of verification and no further, including the clone check on a regressed signature counter.
