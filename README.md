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
- **Passwordless magic links** as a third way in (single-use, 15-minute tokens).
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

## The interesting bits (design decisions and trade-offs)

**`http` behind Cloudflare broke `redirect_uri` matching.** Behind Cloudflare's TLS termination the
Worker can see a request as `http` even though the public URL is `https`. Building the OAuth
`redirect_uri` from the request URL therefore produced `http://...`, which failed Google's
exact-string match. The fix forces `https` for any non-localhost host and runs the same helper for
both the auth request and the token exchange, so the two are byte-identical. The same quirk was
silently dropping the `Secure` flag on cookies in production, fixed the same way.

**CSRF protection is intentionally left to `SameSite=Lax`, not an Origin check.** The session cookie
is `SameSite=Lax`, so it is not attached to cross-site POSTs at all: a forged cross-origin request to
`/auth/delete-account` arrives with no session and just 401s. Because the API is deliberately
cross-origin-callable (a credentialed CORS allowlist for app frontends), turning on a same-origin
Origin guard would add nothing and could break that intended capability. The state-changing GETs
(`/auth/google/callback`, `/auth/magic/callback`) are safe because they require unforgeable tokens.
This was a reasoned "leave it off", not an oversight.

**Account linking is written to be un-takeover-able.** Linking Google to an existing account only
happens by *verified* email, refuses if that Google identity is already attached to a different
account, and only lets Google vouch for an email when it matches the account's. Disconnecting Google
refuses if it would leave the account with no way to sign in, and a Google-only account can set a
password first, so no one can lock themselves out.

**No account enumeration, including timing.** `forgot-password` and `magic-link` always return the
same 200 whether or not the email exists, and a login for a missing email still runs a dummy PBKDF2
verify so it costs the same as a real one. (The one accepted leak: telling a Google-account holder to
"use Google" reveals that account exists. It is rate-limited, and the usability win was judged worth
it.)

**Everything is enforced server-side.** The UI hints (password strength, "set a password first")
are conveniences; every invariant, from lockout prevention to session ownership on revoke, is
enforced in the Worker, and there are tests that prove a user cannot revoke another user's session.

## Talking about this

**The short version.** One login that works across five apps on different subdomains, without any
of those apps ever seeing the session secret. It runs on a Worker, D1 and one Durable Object, and
costs nothing.

**The shape.** You sign in at accounts.aidenjang.com. The Worker sets an httpOnly cookie on the
parent domain, so the browser sends it to every subdomain automatically. When owewell wants to know
who you are, its own Worker forwards the cookie to `/auth/me` and gets back a user or a 401. The
browser never reads the cookie and app JavaScript never touches it. What's in D1 is a SHA-256 hash
of the cookie value, so someone who dumps the database still can't sign in as anyone.

**The call I'd defend.** Apps forward the cookie server-side instead of getting their own JWT. A JWT
would save the round trip, but then signing out everywhere doesn't work: those tokens stay valid
until they expire and there's nothing to revoke. Session revocation was worth more to me than the
latency, because "sign out on the laptop I left at the office" is the feature people actually want.
The round trip is a same-datacenter call between two Workers, so it's a few milliseconds.

**What breaks first.** D1. Every authenticated request in every app becomes a session lookup, so D1
read volume grows with total traffic across all five apps rather than with sign-ins. The fix is a
short-TTL cache in front of the lookup, which trades a few seconds of revocation lag for most of the
reads. I haven't needed it yet.

**What I'd change.** The rate limiter is one Durable Object per IP per action, which means a lot of
tiny objects that mostly sit idle. Fine at this size, wasteful at a bigger one. Cloudflare's own rate
limiting binding would do the same job without the objects, and I'd use it if I started over.

## Testing

Tests run inside the **real Workers runtime** via `@cloudflare/vitest-pool-workers`, against an
isolated in-memory D1 with the app's migrations applied per file, plus the live rate-limiter Durable
Object. Coverage includes registration, login and sessions, verification and reset tokens, password
change, Google-only accounts, magic links, session listing and revocation, and account deletion. The
suite is kept **hermetic** by neutralizing any secrets a local `.dev.vars` would otherwise leak into
the test Worker (so Turnstile is treated as unconfigured and no real email is sent). 251 tests: 139 in the
API, 109 in the web app, 3 in the client.

## Repo layout

- **`packages/api`** and **`packages/web`**: the service. `api` is a Hono Worker (D1
  sessions, Turnstile, per-IP rate limiting via a Durable Object) that also serves the built
  `web` SPA from one origin.
- **`packages/client`**: `@aidenjang/auth-client`, **published to npm**. `loginUrl` / `logoutUrl`
  builders plus the `AuthUser` session shape. Apps depend on this as a versioned package, so the
  session contract has exactly one source of truth.
- **`packages/config`**: the strict shared tsconfig base (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) and flat ESLint config.

## The apps that use it

For the zoomed-out view of how these fit together (the SSO trust flow, the shared Cloudflare
conventions, and how it scales), see [PLATFORM.md](PLATFORM.md).

Each is its own repo and consumes `@aidenjang/auth-client`:

- [owewell](https://owewell.aidenjang.com): split bills, settle up
- [wherever](https://wherever.aidenjang.com): group restaurant swiping
- [iguess](https://iguess.aidenjang.com): multiplayer draw-and-guess versus an AI
- [bloomnote](https://bloomnote.aidenjang.com): write a note, an LLM grows someone a garden

Signing in is optional in all of them. It saves and syncs your data; nothing gates on an account.

## Publishing `@aidenjang/auth-client`

It builds to `dist` (`tsc`) and publishes to npm; the app repos install it as a versioned dep. After
changing the session contract, bump the version and:

```bash
pnpm --filter @aidenjang/auth-client publish --access public
```

## Deploy

Runs on Cloudflare's free tier (Worker + D1 + Durable Object). See
[docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

## Docs

- [docs/API.md](docs/API.md): the `/auth/*` API and the session model
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)
