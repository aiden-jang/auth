# Platform Architecture

This repo (`platform`) holds the identity service that anchors a small constellation of my own
products. They are separate apps in separate repos, but they behave like one platform because they
share a single sign-on and a single set of infrastructure conventions. This document is the
zoomed-out view: how the pieces fit, where the trust boundaries are, and how it holds up under the
constraints it was built against. For app-internal depth, each app has its own README (and, for the
more involved ones, its own `ARCHITECTURE.md`).

The apps: **auth** (this repo, the shared sign-in), **iguess** (realtime draw-and-guess vs an AI),
**owewell** (bill splitting), **wherever** (group restaurant voting), and **bloomnote** (an LLM
grows you a garden).

## 1. The constraints that shaped everything

- **$0 hosting.** Everything runs on Cloudflare's free tier: Workers, Durable Objects, D1 (SQLite),
  and KV. No always-on server, no managed auth vendor, no database bill.
- **No cold starts.** Workers start per request at the edge, so every app is fast from anywhere with
  no warm-up.
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

| App        | Realtime authority              | Durable storage            |
| ---------- | ------------------------------- | -------------------------- |
| auth       | Durable Object (rate limiter)   | D1 (session records)       |
| iguess     | Durable Object per room (WS)    | none (ephemeral in memory) |
| wherever   | Durable Object per session (WS) | D1 + Drizzle               |
| owewell    | Durable Object (live group)     | D1 + Drizzle               |
| bloomnote  | none                            | KV (garden store)          |

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
