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
