# Deploying switchboard

One Fastify API, deployed once, serving every app behind its own route prefix. Frontends
are hosted separately (Cloudflare Pages / Vercel) and call the API across origins. Target
API host: **api.aidenjang.com**. Owe Well is used as the example app below.

## 1. Database (Neon, free)

1. Create a project at https://neon.tech and copy the connection string.
2. It looks like `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`.

## 2. API host (Fly.io)

```bash
# from the repo root
fly launch --no-deploy            # detects the Dockerfile + fly.toml; pick the app name
fly secrets set DATABASE_URL="postgresql://...neon..."
fly secrets set API_PREFIX="/owe-well"                       # this app's route namespace
fly secrets set CORS_ORIGINS="https://owewell.aidenjang.com" # comma-separated frontend origins
fly secrets set COOKIE_DOMAIN=".aidenjang.com"               # shared parent so sessions cross subdomains
fly deploy                        # builds the image, runs migrations on boot, starts
```

The container runs `prisma migrate deploy` on every boot, so the schema is applied
automatically. `NODE_ENV=production` is baked into the image. `WEB_DIR` is left unset, so
the API never serves a frontend.

## 3. Custom domain (you own aidenjang.com)

```bash
fly certs add api.aidenjang.com
```

Add the DNS records Fly prints (a CNAME for `api` to your app's `*.fly.dev` host, plus the
ACME CNAME for the cert). HTTPS is issued automatically.

## 4. Frontends (Cloudflare Pages, free)

Each app's frontend is its own static deploy. For Owe Well: build `packages/web` (output
`dist`) from the `owe-well` repo. `public/_redirects` already routes SPA paths to
`index.html`. Set build-time env:

```
VITE_API_URL=https://api.aidenjang.com/owe-well
VITE_WS_URL=wss://api.aidenjang.com/ws
```

Point `owewell.aidenjang.com` (CNAME) at the Pages deployment.

Cookies stay same-site because both are subdomains of `aidenjang.com`, so `SameSite=Lax`
keeps working (no fragile `SameSite=None`). Keep every frontend on an `aidenjang.com`
subdomain for this to hold.

## Adding another app

1. Add a route module under `packages/server/src/modules/<app>/` and register it.
2. Deploy with that app's `API_PREFIX` and add its frontend origin to `CORS_ORIGINS`.
3. Host its frontend on its own `*.aidenjang.com` subdomain.

## Notes

- **Always-on**: `min_machines_running = 1` with `auto_stop_machines = 'off'` keeps one
  machine warm so there are no idle cold starts (~$3-4/mo for one shared-cpu-1x). To trade
  that for near-zero cost at the price of a few-second wake, set `min_machines_running = 0`
  and `auto_stop_machines = 'stop'`.
- **Receipt OCR** stays on the mock until you `fly secrets set ANTHROPIC_API_KEY=...`
  (uses Claude Haiku vision; cheap at hobby volume).
- **Scaling past one instance** would need the realtime bus moved from in-memory to
  Redis pub/sub (e.g. Upstash). Single instance is fine to start.
- Local dev: `docker compose up -d db`, then `pnpm --filter @aidenjang/server dev`. Run each
  frontend from its own repo (e.g. `pnpm --filter @owe-well/web dev` in the owe-well repo).
