# auth

One login for every aidenjang app. A small identity service that issues a session cookie the other
apps trust, so owewell, bloomnote, and friends don't each reinvent accounts.

**Live:** [accounts.aidenjang.com](https://accounts.aidenjang.com)

`TypeScript` · `Hono` · `Cloudflare Workers` · `D1 + Drizzle` · `Durable Objects` · `Turnstile` · `React` · `Vite`

> This repo is the auth service plus the published [`@aidenjang/auth-client`](../../packages/client)
> SDK, where the shared session contract lives (see the [repo README](../../README.md)).

---

## What it does

- **Register / log in / log out**, with password reset and email verification.
- **Issues the shared session.** On login it sets `platform_session` — an httpOnly, `Secure`,
  `SameSite=Lax` cookie scoped to `.aidenjang.com` — so every subdomain app is signed in at once.
- **Validates sessions for the apps.** Each app forwards the incoming cookie to `GET /auth/me`
  from its own Worker (never the browser) and gets back the user or `null`.
- **Stops bots and abuse.** Cloudflare Turnstile gates sign-up; a per-IP rate limiter (a Durable
  Object) throttles login/register/verify.
- **Hosts the legal pages.** `/privacy` and `/terms` live here as the one canonical copy every app
  links to.

## Architecture

```
   accounts.aidenjang.com — auth Worker (Hono), one origin
        │  /auth/register, /auth/login, /auth/logout, /auth/me, /auth/verify, /auth/reset
        │       │
        │       ├─ password.ts        hash + verify (never store plaintext)
        │       ├─ session.ts         create / validate / revoke sessions
        │       ├─ cookie.ts          platform_session on .aidenjang.com
        │       ├─ verification.ts    email verify + reset tokens
        │       ├─ turnstile.ts       bot check on register
        │       ├─ RateLimiter (DO)   per-IP token bucket
        │       └─ D1 + Drizzle       users + sessions
        │  app.all('*') → built React SPA (login / signup / account / privacy / terms)
        ▼
   other apps ── forward cookie ─▶ /auth/me ─▶ { user | null }   (via @aidenjang/auth-client)
```

## Decisions worth explaining

**One cookie on the parent domain, not per-app accounts.** The session cookie is scoped to
`.aidenjang.com`, so a login on any subdomain signs you into all of them — real single sign-on
without OAuth ceremony between my own apps. The apps share _identity_ while keeping their own data
in their own D1/KV; auth owns only users and sessions.

**Apps validate server-side; the session never touches app JavaScript.** The cookie is httpOnly,
so app frontends can't read it, and they don't try — they forward it to `/auth/me` from their
Worker. The token stays server-to-server, and a compromised app frontend can't exfiltrate a
session. `login`/`logout` are full-page redirects here (built by `@aidenjang/auth-client`), not
cross-origin fetches, which keeps the flow inside first-party navigation.

**CSRF: SameSite first, Origin as defense-in-depth.** `SameSite=Lax` means the browser won't
attach the session to cross-site state-changing requests, which is the primary defense. Auth is
intentionally callable cross-origin (the CORS allowlist), so it leans on SameSite + Turnstile
rather than the same-origin guard the data apps use. See [docs/SECURITY.md](../../docs/SECURITY.md).

**Rate limiting in a Durable Object.** A per-IP token bucket needs a single consistent counter;
a Durable Object addressed by `action:ip` gives exactly that without a shared cache or DB round
trip, and an idle limiter costs nothing.

**Legal pages served from here.** Privacy and terms cover shared identity plus each app's data, so
one canonical copy on the account origin (and every app footer links to it) beats drifting
duplicates.

## Trade-offs

- **Email delivery depends on a provider.** Verification and reset go through an email service; if
  it's unconfigured in dev, those flows no-op rather than fail.
- **No social login / MFA yet.** Password + email verification is the current bar. The session and
  D1 schema leave room to add providers or a second factor without changing the cookie contract.
- **Sessions are opaque rows in D1, not stateless JWTs.** That makes revocation instant (delete
  the row) at the cost of a lookup per validation — the right trade for "log out everywhere" to
  actually mean it.

## Project layout

```
api/                     auth Worker (Hono)
  src/index.ts           routes + CORS allowlist + harden() headers
  src/auth/password.ts   hash + verify
  src/auth/session.ts    create / validate / revoke
  src/auth/cookie.ts     platform_session cookie helpers
  src/auth/verification.ts  email-verify + password-reset tokens
  src/turnstile.ts       bot check; src/email.ts  delivery
  src/rateLimiter.ts     RateLimiter Durable Object (per-IP)
  src/db/                Drizzle schema (users, sessions) + client; migrations/
web/                     React + Vite SPA
  src/pages/             Login, Signup, ForgotPassword, ResetPassword, VerifyEmail,
                         Account, Logout, Privacy, Terms
```

## Running locally

Requires **Node 22** (repo `.nvmrc`) and pnpm.

```bash
pnpm install

# API Worker (Hono + local D1/DO via Miniflare) — the other apps point AUTH_URL here
pnpm --filter @aidenjang/auth-api dev        # http://localhost:34100

# web SPA — http://localhost:34110
pnpm --filter @aidenjang/auth-web dev
```

Apply D1 migrations locally with `pnpm --filter @aidenjang/auth-api db:migrate:local`. Turnstile
and email are optional in dev (unconfigured Turnstile passes; email flows no-op). See
[DEPLOY.md](DEPLOY.md) for the production runbook and secret setup.

## Tests

```bash
pnpm --filter @aidenjang/auth-api test    # password hashing + auth helpers
```
