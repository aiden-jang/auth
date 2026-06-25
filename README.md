# aidenjang-api

Shared backend API platform. One Fastify server hosts multiple apps' APIs as modules,
each mounted under its own prefix (configured by `API_PREFIX`), so a single always-on
deployment serves every app. Frontends are hosted separately (e.g. Cloudflare Pages) and
call this API across origins via CORS.

## Layout

- `packages/server` — the Fastify app: auth (DB-backed session cookies), Prisma, realtime
  WebSocket bus, and the per-app route modules under `src/modules/`.
- `packages/shared` — pure, framework-free logic shared with frontends (money as integer
  cents, split/settle math, types). Published as `@aidenjang/shared`.

## Local development

```bash
docker compose up -d db                      # Postgres on host port 5544
pnpm install
pnpm --filter @aidenjang/server exec prisma migrate dev
pnpm --filter @aidenjang/server dev           # API on :3000
```

## Configuration (env)

- `DATABASE_URL` — Postgres connection string.
- `API_PREFIX` — route namespace for this deployment (default `/api`; e.g. `/owe-well`).
- `CORS_ORIGINS` — comma-separated browser origins allowed to call with credentials.
- `COOKIE_DOMAIN` — shared parent domain so sessions work across subdomains (e.g. `.aidenjang.com`).
- `APP_URL` — public base URL used in emails.

## Adding another app

1. Add a route module under `packages/server/src/modules/<app>/` and register it.
2. Give it its own `API_PREFIX` deployment (or mount it under a distinct sub-prefix).
3. Add the app's frontend origin to `CORS_ORIGINS`.

See `DEPLOY.md` for production (Fly.io) and the split-origin setup.
# switchboard
