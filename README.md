# platform

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

The whole backend (Postgres + the API with hot-reload) comes up with one command:

```bash
docker compose up                            # Postgres :55432, API :30000 (migrates on boot)
```

Source edits under `packages/` reload live (the repo is bind-mounted; tsx watches).
Frontends are **not** in this stack — run each in its own repo and let it proxy `/api`
and `/ws` to `http://localhost:30000` (e.g. `pnpm --filter @owe-well/web dev` → `:30001`).

To create a new migration (the container only *applies* existing ones on boot):

```bash
pnpm --filter @aidenjang/server exec prisma migrate dev --name <name>
```

Prefer running the API on the host instead of in Docker? Start just the DB with
`docker compose up -d db`, then `pnpm install && pnpm --filter @aidenjang/server dev`.

## Configuration (env)

- `DATABASE_URL` — Postgres connection string.
- `API_PREFIX` — route namespace for this deployment (default `/api`; e.g. `/owewell`).
- `CORS_ORIGINS` — comma-separated browser origins allowed to call with credentials.
- `COOKIE_DOMAIN` — shared parent domain so sessions work across subdomains (e.g. `.aidenjang.com`).
- `APP_URL` — public base URL used in emails.

## Adding another app

1. Add a route module under `packages/server/src/modules/<app>/` and register it.
2. Give it its own `API_PREFIX` deployment (or mount it under a distinct sub-prefix).
3. Add the app's frontend origin to `CORS_ORIGINS`.

See `DEPLOY.md` for production (Fly.io) and the split-origin setup.
# platform
