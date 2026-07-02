# Deploying on a free always-on VM (Oracle Cloud Always Free)

The goal: run the whole backend 24/7 for **$0, with no possibility of being charged**.
Oracle Cloud "Always Free" resources are never billed (unlike usage-based hosts, there is no
meter that can run up a bill). The VM runs Postgres + the API + Caddy (automatic HTTPS) with
one `docker compose` command. The frontend stays free on Cloudflare Pages.

```
owewell.aidenjang.com   Cloudflare Pages (free static)   ── calls ──►  api.aidenjang.com
                                                                              │
                                              Oracle Always Free VM ──────────┘
                                              docker compose -f docker-compose.prod.yml:
                                                caddy (443, auto-TLS) → api (:30000) → db (Postgres)
```

Postgres runs on the VM itself (in the compose), so there is no external database bill and no
dependency to keep free. Backups are your responsibility (see below).

## 1. Create the VM

1. Oracle Cloud account (free). During signup you add a card for identity verification only.
   **Always Free resources are not charged.** To be certain you can never be billed, keep the
   account on the free plan and do not click "Upgrade to Pay As You Go."
2. Create a Compute instance:
   - Shape: **VM.Standard.A1.Flex** (Ampere/ARM), e.g. 1-2 OCPU / 6-12 GB RAM. This is Always
     Free eligible and has enough memory to build the image. (If ARM capacity is unavailable,
     the Always Free AMD `VM.Standard.E2.1.Micro` works too, but build the image elsewhere or
     add swap since it only has 1 GB.)
   - Image: Ubuntu LTS.
   - Save the SSH key.
3. Networking: in the instance's subnet security list (and `ufw` if enabled), open inbound
   **22, 80, 443**.

## 2. Install Docker on the VM

```bash
ssh ubuntu@<vm-public-ip>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker   # run docker without sudo
```

## 3. Deploy

```bash
git clone https://github.com/aiden-jang/platform.git
cd platform

# Secrets: a strong DB password, plus any origin overrides.
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
CORS_ORIGINS=https://owewell.aidenjang.com
COOKIE_DOMAIN=.aidenjang.com
APP_URL=https://owewell.aidenjang.com
# ANTHROPIC_API_KEY=   # leave unset to keep receipt OCR on the free mock
EOF

# Point the Caddyfile at your domain (default is api.aidenjang.com).
docker compose -f docker-compose.prod.yml up -d --build
```

The API container runs `prisma migrate deploy` on boot, so the schema is applied automatically.
Caddy fetches a Let's Encrypt cert for the domain in the Caddyfile once DNS resolves to this VM.

## 4. DNS

In Cloudflare DNS for `aidenjang.com`, add an **A record**: `api` → `<vm-public-ip>`, set to
**DNS only (grey cloud)** so Caddy can complete the TLS challenge directly. Within a minute
`https://api.aidenjang.com/health` should return `{"status":"ok","db":"up"}`.

## 5. Frontend (Cloudflare Pages, free)

Deploy the `owe-well` repo to Cloudflare Pages:
- Build command: `pnpm install && pnpm --filter @owe-well/web build`
- Output dir: `packages/web/dist`
- Build-time env:
  ```
  VITE_API_URL=https://api.aidenjang.com/owewell
  VITE_AUTH_URL=https://api.aidenjang.com
  VITE_WS_URL=wss://api.aidenjang.com/ws
  ```
Point `owewell.aidenjang.com` (CNAME) at the Pages site. Cookies stay `SameSite=Lax` because
both are `*.aidenjang.com`.

## Staying at $0 and not getting surprised

- Use only Always Free shapes; do not upgrade the account. Always Free resources have no meter.
- Receipt OCR stays on the mock unless `ANTHROPIC_API_KEY` is set. Leave it unset for zero
  metered spend (or set a hard budget cap in the Anthropic console if you enable it).
- Cloudflare Pages and Cloudflare DNS are free and rate-limit rather than bill.

## Operating it

- Update: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`.
- Backups (you own the data now): cron a `pg_dump`, e.g.
  `docker exec platform-prod-db pg_dump -U platform platform | gzip > ~/backups/$(date +%F).sql.gz`.
- Adding a second app later: it deploys under its own prefix on the same VM (same compose),
  so it stays part of this one free machine. See `docs/API.md`.
