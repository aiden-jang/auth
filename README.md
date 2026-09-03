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
Origin guard would add nothing and could break that intended capability. The one state-changing GET
(`/auth/google/callback`) is safe because it requires an unforgeable token.
This was a reasoned "leave it off", not an oversight.

**Account linking is written to be un-takeover-able.** Linking Google to an existing account only
happens by _verified_ email, refuses if that Google identity is already attached to a different
account, and only lets Google vouch for an email when it matches the account's. Disconnecting Google
refuses if it would leave the account with no way to sign in, and a Google-only account can set a
password first, so no one can lock themselves out.

**No account enumeration, including timing.** `forgot-password` always returns the
same 200 whether or not the email exists, and a login for a missing email still runs a dummy PBKDF2
verify so it costs the same as a real one. (The one accepted leak: telling a Google-account holder to
"use Google" reveals that account exists. It is rate-limited, and the usability win was judged worth
it.)

**Four account-page features were deleted rather than improved.** A world map of session
locations, a scored security check-up, a recovery rehearsal, and a security activity feed. Each one
looked like security and gave you nothing to act on: the map redrew a list that already said
"Chrome on macOS, Boston", and the score moved when you did things without ever naming what was at
risk. Deleting them took 1,595 lines out against 503 added. The event _recording_ stayed, because
two things still read it that nobody sees: the "was that you?" alert emails, and the data export.
Collecting rows nobody can read would have been worse than either keeping or dropping the feature.

**Magic-link sign-in was removed without usage data, but not without evidence.** Nobody could say
how many people used it, because until recently every sign-in path recorded the same `signed_in`
event with no method attached. What _could_ be settled from the code was the thing that actually
mattered: whether removing it would lock anyone out. `passwordHash` is set to null in exactly one
place, Google account creation, which sets `googleId` in the same insert; `googleId` is set to null
in exactly one place, disconnect, which refuses unless a password exists. So every account
permanently holds a password or a Google link, and the emailed link was never anyone's only way in.
Sign-ins now record their method, so the next decision of this kind gets numbers instead.

**Rules the code states about itself are tested, not trusted.** `lib/reassurance.ts` opens by
demanding every line be "a true, specific claim about this implementation". Six of its eight lines
had quietly stopped being rendered anywhere, so they could not drift visibly and nothing would ever
have caught it. There is now a test that walks `src/`, collects every `reassurance('...')` call
site, and fails on any line without one. `lib/apps.ts` gets the same treatment for the launcher:
names must be lower case, hosts and dev ports unique, accents valid hex clearing a contrast floor,
because a duplicated host silently makes `returnAppFor` show the wrong app's name and colour.

**Everything is enforced server-side.** The UI hints (password strength, "set a password first")
are conveniences; every invariant, from lockout prevention to session ownership on revoke, is
enforced in the Worker, and there are tests that prove a user cannot revoke another user's session.

## Talking about this

**The short version.** One login that works across six apps on different subdomains, without any
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
read volume grows with total traffic across all six apps rather than with sign-ins. The fix is a
short-TTL cache in front of the lookup, which trades a few seconds of revocation lag for most of the
reads. I haven't needed it yet.

**How things rot here, and what I do about it.** Nothing in this codebase fails when two places
that should agree stop agreeing. The browser tab showed a key while the page header showed a
receipt, which is owewell's glyph, so the tab and the page advertised different products, and every
test still passed. Same shape as the copy lines nobody rendered and the launcher accents that had
drifted to colours their apps do not contain. My answer is to make agreement checkable rather than
remembered: the mark is one component instead of two copies, the PNG icons are generated from the
SVG by a committed script, and the copy and launcher rules are tests. Where a test genuinely cannot
reach, like accents that live in other repos, the rule is written down at the point of use instead.

**What I'd change.** The rate limiter is one Durable Object per IP per action, which means a lot of
tiny objects that mostly sit idle. Fine at this size, wasteful at a bigger one. Cloudflare's own rate
limiting binding would do the same job without the objects, and I'd use it if I started over.

## Testing

Tests run inside the **real Workers runtime** via `@cloudflare/vitest-pool-workers`, against an
isolated in-memory D1 with the app's migrations applied per file, plus the live rate-limiter Durable
Object. Coverage includes registration, login and sessions, verification and reset tokens, password
change, Google-only accounts, session listing and revocation, and account deletion. The
suite is kept **hermetic** by neutralizing any secrets a local `.dev.vars` would otherwise leak into
the test Worker (so Turnstile is treated as unconfigured and no real email is sent). 396 tests: 282 in the
API, 82 in the web app, 32 in the client.

Above them, a Playwright suite walks the journey none of them can see: register, follow the link
from the verification email, sign out, sign back in. It reads the token out of the dev worker's own
log, because the database stores only a hash and the raw token exists nowhere else — so the link it
follows is the one a real person would click. `pnpm --filter @aidenjang/auth-web e2e`.

## Repo layout

- **`packages/api`** and **`packages/web`**: the service. `api` is a Hono Worker (D1
  sessions, Turnstile, per-IP rate limiting via a Durable Object) that also serves the built
  `web` SPA from one origin.
- **`packages/client`**: `@aidenjang/auth-client`, **published to npm**. `loginUrl` / `logoutUrl`
  builders plus the `AuthUser` session shape. Apps depend on this as a versioned package, so the
  session contract has exactly one source of truth. Resolve a session with `resolveSession`, which
  separates `signed-out` from `unavailable`; `getSessionUser` returns null for both and is kept for
  the apps already on it.
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
- [offscript](https://offscript.aidenjang.com): go somewhere you did not plan
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

## Deploy

Runs on Cloudflare's free tier (Worker + D1 + Durable Object). See
[docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

## Docs

- [docs/API.md](docs/API.md): the `/auth/*` API and the session model
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)
