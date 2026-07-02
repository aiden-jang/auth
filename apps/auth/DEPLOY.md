# Deploying the auth service → accounts.aidenjang.com

One Cloudflare Worker serves both the API (`/auth/*`, `/health`) and the login/account UI
(static assets from `apps/auth/web/dist`), on one origin. Free tier. These steps need your
Cloudflare login, so run them yourself. All commands from `apps/auth/api`.

```bash
cd apps/auth/api
pnpm exec wrangler login
```

## 1. Create the identity D1
```bash
pnpm exec wrangler d1 create aidenjang-identity
```
Copy the printed `database_id` into `wrangler.toml` (replace `local-dev-placeholder`).

## 2. Apply migrations to the remote D1
```bash
pnpm exec wrangler d1 migrations apply aidenjang-identity --remote
```

## 3. Config + secrets (kept out of the repo; do not affect local dev)
```bash
pnpm exec wrangler secret put COOKIE_DOMAIN      # .aidenjang.com
pnpm exec wrangler secret put CORS_ORIGINS       # https://owewell.aidenjang.com,https://bloomnote.aidenjang.com
pnpm exec wrangler secret put APP_URL            # https://accounts.aidenjang.com
pnpm exec wrangler secret put EMAIL_FROM         # owewell <noreply@aidenjang.com>
pnpm exec wrangler secret put RESEND_API_KEY     # resend.com key (optional; emails just log if unset)
pnpm exec wrangler secret put TURNSTILE_SECRET   # Cloudflare Turnstile secret (optional; skipped if unset)
```

## 4. Build the UI + deploy the Worker
```bash
pnpm --filter @aidenjang/auth-api deploy
```
This builds `auth-web` then runs `wrangler deploy`, uploading the Worker + `web/dist` assets and
provisioning `accounts.aidenjang.com` from the `[[routes]]` custom-domain entry (needs the
`aidenjang.com` zone on this account).

## 5. Smoke test
```bash
curl https://accounts.aidenjang.com/health        # {"status":"ok","service":"auth"}
```
Open `https://accounts.aidenjang.com/login`, sign up, and confirm the `platform_session` cookie is
set on `.aidenjang.com`.

## Notes
- **Email**: without `RESEND_API_KEY`, verification/reset emails are logged, not sent. To deliver,
  set the key and add SPF/DKIM/DMARC for `aidenjang.com`.
- **Turnstile**: set `TURNSTILE_SECRET` here and the site key in the UI to enforce the CAPTCHA;
  skipped until both exist.
- **Wrangler**: the `assets` + `run_worker_first` config needs a recent wrangler (verified working
  on the pinned version); `pnpm add -D wrangler@4` in this package if you hit a config error.
- **Local dev** is unaffected by all of the above: `pnpm exec wrangler dev` (API) + the auth-web
  Vite dev server, using the local D1 and no secrets.
