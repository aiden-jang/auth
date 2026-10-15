# auth

The shared identity service behind my apps: one login that every `*.aidenjang.com` app trusts,
running on a Cloudflare-native stack under a hard **$0 hosting** budget with **no cold starts**. A
small Worker at [accounts.aidenjang.com](https://accounts.aidenjang.com) issues the session cookie,
and a published SDK (`@aidenjang/auth-client`) is the single place the session contract lives.

## The constraints that shaped it

- **$0 hosting.** Everything runs on Cloudflare's free tier: a Worker, D1 (SQLite), and a Durable
  Object. No always-on server, no managed auth vendor.
- **No cold starts.** Workers start per-request at the edge, so sign-in is fast from anywhere with
  no warm-up.
- **One login, many apps.** The session has to be valid across every app on a subdomain without each
  app ever handling the session secret.

Those three constraints drove most of the decisions below.

## What it does

- **Email + password** with PBKDF2 hashing, email verification, and password reset.
- **Google sign-in** (OIDC authorization-code flow), including linking Google to an existing
  password account and disconnecting it later.
- **Account hub**: active-session list with per-device revoke and "sign out everywhere", plus
  self-serve account deletion.
- **Abuse controls**: per-IP, per-action rate limiting and a Turnstile challenge on the sensitive
  flows.

## How it works

The Worker sets a `platform_session` cookie on `.aidenjang.com` (httpOnly, `SameSite=Lax`), so one
sign-in covers every subdomain. The key move: **apps never read the cookie in the browser.** Each
app forwards it to `/auth/me` from its own Worker via `@aidenjang/auth-client`, so the session secret
never touches application JavaScript. Sign-in and sign-out are full-page redirects to the auth
origin. The token stored in D1 is a SHA-256 hash of the cookie value, so a database leak never hands
out live sessions.

One Worker serves both the JSON API (`/auth/*`) and the built login/account SPA (Workers static
assets), so the whole thing is a single origin with a single deploy.

## Testing

Tests run inside the **real Workers runtime** via `@cloudflare/vitest-pool-workers`, against an
isolated in-memory D1 with the app's migrations applied per file, plus the live rate-limiter Durable
Object. Coverage includes registration, login and sessions, verification and reset tokens, password
change, Google-only accounts, session listing and revocation, and account deletion. The
suite is kept **hermetic** by neutralizing any secrets a local `.dev.vars` would otherwise leak into
the test Worker (so Turnstile is treated as unconfigured and no real email is sent). Coverage spans
the API, the SPA's shared logic, and the published client.

Above them, a Playwright suite walks the journey none of them can see: register, follow the link
from the verification email, sign out, sign back in. It reads the token out of the dev worker's own
log, because the database stores only a hash and the raw token exists nowhere else, so the link it
follows is the one a real person would click. `pnpm --filter @aidenjang/auth-web e2e`.

## Sharing preview

Accounts has its own slate and ice-blue preview at `https://accounts.aidenjang.com/og.png`.
It uses the shared key mark and bundled DM Sans, with static branding across sign-in and recovery
links. The image contains no account or return-destination data.

Regenerate the committed SVG and PNG after changing the mark or preview copy:

```sh
pnpm --filter @aidenjang/auth-web run gen:og
```

The same PNG can be uploaded under the GitHub repository's Settings → Social preview.

## Repo layout

- **`packages/api`** and **`packages/web`**: the service. `api` is a Hono Worker (D1
  sessions, Turnstile, per-IP rate limiting via a Durable Object) that also serves the built
  `web` SPA from one origin.
- **`packages/client`**: `@aidenjang/auth-client`, **published to npm**. `loginUrl` / `logoutUrl`
  builders plus the `AuthUser` session shape. Apps depend on this as a versioned package, so the
  session contract has exactly one source of truth. Resolve a session with `resolveSession`, which
  tells a signed-out visitor apart from an auth service it could not reach. `getSessionUser`
  returns null for both and stays for the apps still on it.
- **`packages/config`**: the strict shared tsconfig base (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) and flat ESLint config.

## The apps that use it

For the zoomed-out view of how these fit together (the SSO trust flow, the shared Cloudflare
conventions, and how it scales), see [PLATFORM.md](PLATFORM.md).

Each is its own repo. These resolve identity through `@aidenjang/auth-client`, so they are the
list to check before changing the session contract:

- [owewell](https://owewell.aidenjang.com): split bills, settle up
- [bloomnote](https://bloomnote.aidenjang.com): write a note, an LLM grows someone a garden
- [coast](https://coast.aidenjang.com): nothing to win, nowhere to be
- [mrrp](https://mrrp.aidenjang.com): one of you is the cat

[wherever](https://wherever.aidenjang.com) (group restaurant voting) and
[iguess](https://iguess.aidenjang.com) (draw-and-guess versus an AI) are on the platform but do not
sign anyone in yet, so a change here cannot break them.

Signing in is optional in all of them. It saves and syncs your data; nothing gates on an account.

## Publishing `@aidenjang/auth-client`

It builds to `dist` (`tsc`) and publishes to npm; the app repos install it as a versioned dep. After
changing the session contract, bump the version and:

```bash
pnpm --filter @aidenjang/auth-client publish --access public
```

The account is on npm 2FA in `auth-and-writes` mode, so this needs a granular access token in
`~/.npmrc` or it stops to ask for one in a browser. Two things about that token are easy to get
wrong: it needs **read and write**, and it has to cover the `@aidenjang` _scope_ -- `@aidenjang` is
an organization, so picking the package by name misses it and the publish fails with a 404 on PUT
rather than a permission error. `npm whoami` returning 401 on such a token is normal.

## Deploy

Runs on Cloudflare's free tier (Worker + D1 + Durable Object). See
[docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

## Docs

- [docs/API.md](docs/API.md): the `/auth/*` API and the session model
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)
