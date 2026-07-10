# platform

A monorepo that converges several of my side projects onto one Cloudflare-native stack: shared
identity, shared tooling, one deploy story, and a hard **$0 hosting** constraint with **no cold
starts**. It exists both to run these apps cheaply and to be a single, coherent place to show how
I think about system design.

Every app is a Cloudflare Worker that serves its own SPA and its own API from one origin, backed
by Durable Objects / D1 / KV as each needs. One small auth service issues a cookie that all of
them trust. Nothing here runs on a container or a always-on VM, so idle cost is zero and there is
no cold-start penalty.

## The apps

| App | What it is | Live | Stack highlights |
| --- | --- | --- | --- |
| **[owewell](apps/owewell)** | Split bills, settle up, keep friends | [owewell.aidenjang.com](https://owewell.aidenjang.com) | Hono · D1 + Drizzle · Durable Object realtime · receipt OCR |
| **[bloomnote](apps/bloomnote)** | Write a note, an LLM grows someone a garden | [bloomnote.aidenjang.com](https://bloomnote.aidenjang.com) | Hono · KV short-links · Gemini via function-calling · SSE |
| **[auth](apps/auth)** | Shared identity for all of the above | [accounts.aidenjang.com](https://accounts.aidenjang.com) | Hono · D1 · sessions · Turnstile · per-IP rate limiting |

> [wherever](https://wherever.aidenjang.com) (group restaurant swiping) and [is-it-a-dog](https://is-it-a-dog.aidenjang.com) (draw-and-guess vs an AI) each live in their own repo now.

Each app's README covers what it is, the decisions behind it (including *why this and not something
simpler*), and how it would scale.

## Why it's built this way

- **$0, no cold starts.** Cloudflare Workers bill per request with a generous free tier and boot in
  ~milliseconds at the edge. Durable Objects give per-entity single-threaded state (game rooms,
  bill groups, vote sessions) without a database round-trip on every message. D1 (SQLite) and KV
  cover relational and key-value needs. The only thing I pay for is the domain.
- **One Worker per app, serving SPA + API from one origin.** `run_worker_first` + static assets +
  SPA fallback means no CORS, no separate frontend host, one deploy per app. The Worker routes
  `/api` (or `/owewell`, `/rooms`, …); everything else falls through to the built SPA.
- **Shared identity, validated server-side.** The auth service sets a `platform_session` cookie on
  `.aidenjang.com`. Apps never read it in the browser — they forward it to `/auth/me` from their
  own Worker (`@aidenjang/auth-client`), so the session secret never touches app JavaScript.
- **Source-first internal packages.** Shared code (`@aidenjang/*`, `@owewell/core`) is imported as
  TypeScript source through pnpm workspaces — no build step between packages, one strict tsconfig,
  refactors cross package boundaries in one commit.

```
                          accounts.aidenjang.com  ── auth Worker (D1 sessions, Turnstile)
                                   ▲  sets platform_session cookie on .aidenjang.com
                                   │  apps validate server-side via /auth/me
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                            │
  owewell.aidenjang.com     bloomnote.aidenjang.com     is-it-a-dog.aidenjang.com   …
   Worker: SPA + /owewell    Worker: SPA + /api          Worker: SPA + /rooms
   D1 + Drizzle              KV short-links               Durable Object game rooms
   DO realtime fan-out       Gemini (SSE)                 ai-worker (vision) ◀ HTTP
```

## Shared packages

- **`@aidenjang/config`** — the strict tsconfig base (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) + the flat ESLint config every package
  extends.
- **`@aidenjang/auth-client`** — `getSessionUser(request, AUTH_URL)` plus `loginUrl`/`logoutUrl`
  builders. The one place the session contract lives.
- **`@aidenjang/http`** — security headers (CSP, HSTS, …) + a same-origin CSRF guard, wrapped in a
  Hono `harden()` middleware. See [docs/SECURITY.md](docs/SECURITY.md).
- **`@owewell/core`** — owewell's pure money/split math, unit-tested in isolation from any I/O.

## Repo layout

```
apps/
  auth/        { api (Worker), web (React) }          shared identity service
  owewell/     { api (Worker), web (React) }          + @owewell/core
  bloomnote/   { api (Worker), web (React) }
packages/
  config/  auth-client/  http/  shared/  owewell-core/
docs/
  API.md  SECURITY.md  OBSERVABILITY.md
```

## Local development

Requires **Node 22** (`.nvmrc`) and **pnpm** (via `corepack enable`).

```bash
pnpm install
pnpm typecheck        # all packages
pnpm lint             # flat ESLint across the workspace
pnpm test             # per-package test suites
pnpm build            # build everything
```

Each app runs on `wrangler dev` (Miniflare emulates D1/DO/KV locally) plus `vite` for its SPA.
See the app's own README for its exact dev commands and ports, and its `DEPLOY.md` for deploys.

## Operations

- **Deploy:** `wrangler deploy` per app; custom domains are provisioned on first deploy. Each app
  has a `DEPLOY.md` runbook.
- **CI:** `.github/workflows/ci.yml` runs typecheck + lint + build + tests on every push;
  Dependabot keeps dependencies patched.
- **Observability:** Workers Logs enabled on every Worker; Web Analytics + uptime documented in
  [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md).
- **Security & legal:** posture in [docs/SECURITY.md](docs/SECURITY.md); shared privacy policy +
  terms served from the account app.
