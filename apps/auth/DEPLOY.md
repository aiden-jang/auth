# Deploying the auth service → accounts.aidenjang.com

**Status: LIVE.** One Cloudflare Worker (`aidenjang-auth`) serves both the API (`/auth/*`,
`/health`) and the login/account UI (static assets) on one origin, `accounts.aidenjang.com`.
Identity D1: `aidenjang-identity` (its `database_id` is already in `wrangler.toml`). Free tier.

All commands run from `apps/auth/api`.

## Routine redeploy (the usual case)

```bash
pnpm exec wrangler deploy   # ship an API/config change (uses the last-built UI assets)
# or, if the UI (apps/auth/web) changed:
pnpm run deploy             # builds auth-web, then wrangler deploy
```

- No re-login needed: `wrangler login` stores credentials (`~/Library/Preferences/.wrangler/`)
  that persist across sessions. All `wrangler` commands reuse them until they expire.
- It's `pnpm exec wrangler deploy` (runs the workspace binary), **not** `pnpm wrangler deploy`.
- Do **not** run bare `pnpm deploy` — that's pnpm's built-in command, unrelated. Use `pnpm run deploy`.

## Config / secrets (already set; change with the same command)

```bash
echo "<value>" | pnpm exec wrangler secret put <NAME>
```
Currently set: `COOKIE_DOMAIN=.aidenjang.com`, `CORS_ORIGINS` (owewell + bloomnote origins),
`APP_URL=https://accounts.aidenjang.com`, `EMAIL_FROM`. Secrets don't affect local dev.

**Not yet set (optional):**
- `RESEND_API_KEY` — until set, verification/reset emails are logged, not sent. To deliver, set
  it and add SPF/DKIM/DMARC for `aidenjang.com`.
- `TURNSTILE_SECRET` — until set (plus the site key in the UI), the CAPTCHA is skipped.

## One-time account setup (done — reference)

- `pnpm exec wrangler login` (once; persists).
- The account needs a **workers.dev subdomain**, even for a custom-domain-only Worker. Set via
  Dashboard → Workers & Pages → subdomain, or the API:
  ```bash
  TOKEN=$(grep oauth_token "$HOME/Library/Preferences/.wrangler/config/default.toml" | sed -E 's/.*= *"([^"]+)".*/\1/')
  curl -X PUT "https://api.cloudflare.com/client/v4/accounts/a8577323eaa4cc3f1812c163775e81ab/workers/subdomain" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"subdomain":"aidenjang"}'
  ```

## First deploy of a NEW worker (done for auth; the pattern for future apps)

1. `pnpm exec wrangler d1 create <name>` → paste the printed `database_id` into `wrangler.toml`.
2. `pnpm exec wrangler d1 migrations apply <name> --remote`.
3. **Custom-domain two-step**: a Worker must have a deployment before a custom domain attaches.
   So temporarily comment the `[[routes]] custom_domain` block, `wrangler deploy` (creates the
   first deployment), then uncomment it and `wrangler deploy` again to attach the domain.
4. Set config secrets (above).

## Gotchas we actually hit (so you don't rediscover them)

- **`error 10063: need a workers.dev subdomain`** → register one (one-time account setup above).
- **`Cannot attach custom domain: Worker has no deployments`** → the two-step first deploy above.
- **register/login return 500 in prod but work locally** → Cloudflare caps PBKDF2 at **100,000
  iterations**; keep `ITERATIONS <= 100000` in `src/auth/password.ts`. Local `wrangler dev`
  doesn't enforce the cap, so it only shows up in prod.

## Smoke test

```bash
curl https://accounts.aidenjang.com/health     # {"status":"ok","service":"auth"}
```
Then open `https://accounts.aidenjang.com/login`, sign up, confirm the `platform_session` cookie.

## Local dev (no Cloudflare needed)

`pnpm exec wrangler dev` (API on :34100, local D1) + the auth-web Vite dev server (:34110). No
secrets; cookie is host-only.
