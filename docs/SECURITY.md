# Security posture

What's in place across the platform, and the deliberate gaps.

## Identity & sessions

- Passwords hashed (never stored plaintext); registration gated by Cloudflare Turnstile.
- Session is an httpOnly, `Secure`, `SameSite=Lax` cookie `platform_session` scoped to
  `.aidenjang.com`. Apps never read it in the browser — they validate server-side by forwarding
  the cookie to the auth service's `/auth/me` (`resolveSession`).
- An app must not read an outage as a sign-out. `/auth/me` failing means the session is unproven,
  not absent: treat `unavailable` as "keep them as they were", never as signed out.
- Per-IP rate limiting on auth actions (login/register/verify) via a Durable Object.

## Step-up re-authentication

A session cookie proves who you were when you signed in, not that you are still at the keyboard.
Anything that changes how the account can be signed into afterwards needs a session that proved
itself within the last 10 minutes (`SUDO_WINDOW_MS`), and answers `403 REAUTH_REQUIRED` otherwise.
The window runs from the last proof, never extended by activity — a window that ordinary use
extended would never close for a stolen cookie either.

Behind the gate: adding a passkey, removing a passkey, setting a password on a passwordless
account, unlinking Google, and deleting a passwordless account.

Adding a passkey belongs there for a reason worth stating: changing a password revokes every
session but does not remove credentials, so a passkey registered by somebody else keeps working
after the owner has done everything they were told to do.

Changing a password is not gated — it asks for the current password, which is the same proof.
Deleting an account that has a password asks for that password. Reading, renaming and signing
other devices out are not gated; gating ordinary use would make the window a nuisance rather than
a defence.

## Transport & response headers

Every web-facing Worker sets a common set of headers via `@aidenjang/http` (`harden()` for the
Hono Workers). See `packages/http/src/index.ts` for the exact values.

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
  whose `Origin` header is present and points at a different host. Auth leaves this to SameSite +
  Turnstile + its CORS allowlist because it is intentionally callable cross-origin.

## Dependencies

- `.github/dependabot.yml` — weekly npm (workspace-wide) + GitHub Actions updates, minor/patch
  grouped, majors individual.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + build + tests on every push.

## Known gaps / follow-ups

- Security headers are wired into each app's Worker via the inlined `harden()` middleware.
- No secret scanning beyond git hygiene; secrets live only in `wrangler secret` / `.dev.vars`
  (gitignored), never committed.
- Registration answers `409 EMAIL_TAKEN`, which does tell a caller whether an address has an
  account. Accepted deliberately: the alternative makes sign-up unusable. `forgot-password` is
  always `200` and does not enumerate.
- The passkey ceremonies have no test that completes one. Doing so needs a software authenticator
  to sign a real attestation, so `finishRegistration` and `finishLogin` are covered up to the point
  of verification and no further — including the clone check on a regressed signature counter.
