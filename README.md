# platform

Monorepo for a set of consumer apps and the shared pieces behind them. Each app is
independently deployed on Cloudflare (Pages + Workers + D1 + Durable Objects); identity is
shared through one small auth service. Free to run, no cold starts.

> Migration in progress. This repo is converging several previously separate projects into
> one monorepo and onto Cloudflare. See the plan for the step-by-step. Apps mid-port may not
> run locally until their port lands.

## Layout

- `apps/` — one folder per app (e.g. `apps/owewell` with its `web` + `server`). More apps
  land here as they're imported.
- `packages/`
  - `config` (`@aidenjang/config`) — shared tsconfig + eslint used across the monorepo.
  - `shared` (`@aidenjang/shared`) — owewell's pure money/split logic (becomes `owewell-core`).

## Local development

```bash
pnpm install
pnpm dev:owewell        # run a single app
pnpm typecheck          # all packages
pnpm lint
```

No Docker: once ported, each app runs on `wrangler dev` (miniflare emulates D1/DO/KV) + `vite`.

## Conventions

- pnpm workspaces; shared config extended per package from `@aidenjang/config`.
- Prettier config at the root; run `pnpm format`.
