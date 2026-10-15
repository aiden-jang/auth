# Platform Architecture

This repo (`auth`) holds the identity service that anchors a small constellation of my own
products. They are separate apps in separate repos, but they behave like one platform because they
share a single sign-on and a single set of infrastructure conventions. This document is the
zoomed-out view: how the pieces fit, where the trust boundaries are, and how it holds up under the
constraints it was built against. For app-internal depth, each app has its own README (and, for the
more involved ones, its own `ARCHITECTURE.md`).

The apps: **auth** (this repo, the shared sign-in), **owewell** (bill splitting), **bloomnote** (an
LLM grows you a garden), **coast**, **mrrp**, **iguess** (realtime draw-and-guess vs an AI) and
**wherever** (group restaurant voting). The first four sign people in through auth; the last two do
not yet.

For the current Accounts module map, validation, and release boundaries, see [ARCHITECTURE.md](ARCHITECTURE.md). The sections below explain the wider platform decisions; each app owns its current adoption of shared sign-in.

## 1. The constraints that shaped everything

- **$0 hosting.** Everything runs on Cloudflare's free tier: Workers, Durable Objects, D1 (SQLite),
  and KV. No always-on server, no managed auth vendor, no database bill.
- **Edge execution.** Workers avoid an always-on origin server; startup and latency still depend on the runtime and request.
- **One login, many apps, zero shared secrets in app code.** A session valid across every
  `*.aidenjang.com` app, without any app ever handling the session secret in the browser.
- **Independently shippable.** Each app is its own repo with its own CI/CD, so one app's deploy
  cannot break another. The only thing they share on purpose is the session contract.

## 2. The shape

```
                    ┌─────────────────────────────────────────────┐
                    │  Browser                                     │
                    │  one cookie `platform_session`, set on       │
                    │  .aidenjang.com (httpOnly, SameSite=Lax)     │
                    └───────────────┬─────────────────────────────┘
   full-page redirect to sign in    │   every request carries the cookie
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
   ┌─────────────────────────────┐     ┌──────────────────────────────┐
   │  App Worker                 │     │  auth Worker                  │
   │  iguess / owewell /         │     │  accounts.aidenjang.com       │
   │  wherever / bloomnote       │ ──▶ │  - mints + sets the cookie    │
   │  (own repo, own DO / D1/KV) │ fwd │  - validates the session      │
   │                             │ cookie  (D1 stores sha-256(token)) │
   │  depends on the published   │ ◀── │  - Google OIDC, passkeys,     │
   │  @aidenjang/auth-client SDK │ AuthUser  PBKDF2 password auth      │
   └─────────────────────────────┘     └──────────────────────────────┘
```

The key move: **an app never reads the session cookie in the browser.** Its own Worker forwards the
cookie to the auth Worker's `/auth/me` and gets back a typed `AuthUser` (or 401). The session secret
never touches application JavaScript, and the token stored in D1 is a SHA-256 hash of the cookie
value, so a database leak never hands out live sessions.

## 3. Single sign-on across independent apps

- **The cookie is the shared state.** It is set on the parent domain `.aidenjang.com`, so it is
  valid on every subdomain automatically. Sign-in and sign-out are full-page redirects to the auth
  origin; no app implements its own login form.
- **The SDK is the shared contract.** `@aidenjang/auth-client` (published to npm) is the single place
  the session shape and the `loginUrl` / `logoutUrl` builders live. Apps depend on it as a versioned
  package, so there is exactly one source of truth for "what a session is."
- **Auth is optional, everywhere.** No app gates on an account. Signing in saves and syncs your data;
  without it, every app is still fully usable (room codes, share links, local play). This keeps each
  product's front door frictionless and keeps auth a genuine enhancement, not a gate.

## 4. Shared building blocks (and where they diverge)

Every app is a Cloudflare Worker (Hono for the HTTP ones), but each one reaches for the right
primitive for its own problem:

| App       | Realtime authority              | Durable storage            |
| --------- | ------------------------------- | -------------------------- |
| auth      | Durable Object (rate limiter)   | D1 (session records)       |
| iguess    | Durable Object per room (WS)    | none (ephemeral in memory) |
| wherever  | Durable Object per session (WS) | D1 + Drizzle               |
| owewell   | Durable Object (live group)     | D1 + Drizzle               |
| bloomnote | none                            | KV (garden store)          |

The pattern worth noting: **one Durable Object is the single writer for one live unit** (a game room,
a voting session, a rate-limit key). That is what makes realtime correct without a lock or an
external coordinator: one isolate owns one unit, so writes serialize by construction.

## 5. Why separate repos plus a published SDK, not a monorepo

A monorepo would make cross-cutting changes atomic, but it would also couple deploys and blur
ownership. Separate repos keep each app independently shippable and independently reasoned about; the
one thing that genuinely must stay in sync, the session contract, is pinned by a **versioned npm
package** rather than by physical proximity. Changing the contract is a deliberate act: bump the SDK,
publish, and each app upgrades on its own schedule. The cost is that a contract change is not a single
PR, which is the right trade for a set of products that ship on different cadences.

## 6. Scaling and trust boundaries

- **Scale.** Stateless Workers scale horizontally for free. The stateful parts are bounded by design:
  a Durable Object serves one room or session, so load scales with the number of concurrent units,
  not with a single hot process. None of these apps is near a free-tier ceiling; the honest limit is
  D1 write throughput and DO memory per unit, both far above hobby traffic.
- **Trust boundary.** The auth origin is the only place that reads or writes session secrets. Apps
  are untrusted with respect to identity: the worst a compromised app Worker can do is act within a
  session it was already handed, never mint or read one for another app. Rate limiting and abuse
  controls live at the auth edge (per-IP, per-action) plus a Turnstile challenge on sensitive flows.
- **Server-side enforcement.** Every invariant (lockout prevention, session ownership on revoke,
  account-linking rules) is enforced in the Worker, not the UI. See [docs/SECURITY.md](docs/SECURITY.md).

## 7. Decision log (X over Y)

- **Cloudflare Workers + D1 + DO over a VPS or a managed auth vendor.** The $0 / no-cold-start /
  edge constraints, met without an always-on server or a per-MAU auth bill.
- **Durable Objects over Redis or a socket server.** Single-writer-per-unit realtime with no
  external store and no cross-instance race, which is exactly the guarantee the games and voting need.
- **Cookie forwarded server-side over a token read in JS.** The session secret never reaches
  application JavaScript, so an XSS in any one app cannot exfiltrate a platform session.
- **Separate repos + a published SDK over a monorepo.** Independent deploys and ownership, with the
  session contract pinned by semver instead of by co-location.
- **`SameSite=Lax` over an Origin CSRF check.** A reasoned decision given the credentialed CORS
  allowlist; documented in [docs/SECURITY.md](docs/SECURITY.md).

## 8. Per-app deep dives

- **auth**: [README](README.md), [SECURITY](docs/SECURITY.md), [API](docs/API.md), [OBSERVABILITY](docs/OBSERVABILITY.md)
- **iguess**: realtime engine, mode plugins, AI vision data flow (see its `ARCHITECTURE.md`)
- **wherever**: Durable-Object voting, pure decision core, swappable data source
- **owewell**: money-as-integer-cents, split/settlement math, live group sessions
- **bloomnote**: LLM output validation and a KV-metered budget cap

# Design decisions, moved out of the README

_Moved out of the README, which is the front door and was carrying the whole house._

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
