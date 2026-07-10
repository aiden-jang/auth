# Deploy checklist — Phase 5 rollout

Phase 5 landed platform-wide changes (security headers, Workers Logs, legal pages, PWA/OG, plus
owewell feature work and the auth logout fix). Several apps also need their **first** production
deploy. This sequences the whole rollout. Per-app mechanics live in each app's `DEPLOY.md`; this
is the order, the outstanding items, and what to verify.

> You run every credential-touching command (`wrangler deploy`, `wrangler secret put`,
> `d1 migrations apply --remote`). Commands below are copy-paste ready; nothing here needs my
> Cloudflare token.

## 0. Prereqs

```bash
nvm use            # Node 22
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # green before shipping
```

Custom-domain routes are already active in every `wrangler.toml`. For an app's **first** deploy,
if `wrangler deploy` errors provisioning the domain, use the two-step: comment the `[[routes]]`
block, deploy, uncomment, deploy again.

## 1. auth — REDEPLOY first (everything validates against it)

Changed since live: `/logout` route + LogoutPage, reworded account/signup copy, **legal pages**
(`/privacy`, `/terms`), **security headers**, favicon, **Workers Logs**.

```bash
pnpm --filter @aidenjang/auth-api run deploy      # builds auth-web, then wrangler deploy
```

Verify: `curl -sI https://accounts.aidenjang.com/health` shows the security headers (CSP, HSTS,
`X-Content-Type-Options`); `/privacy` and `/terms` render; sign in, then **sign out** actually
clears the session (the bug this fixes); `/login` still works.


## 3. bloomnote — FIRST deploy (3.7)

KV namespace already created. Needs the Gemini secret. Changed since the port: title fix, legal
footer, **PWA manifest/SW**, **security headers**, **Workers Logs**.

```bash
pnpm --filter @bloomnote/api exec wrangler secret put GEMINI_API_KEY
pnpm --filter @bloomnote/api run deploy
```

Verify: `https://bloomnote.aidenjang.com/health`; compose a garden (real Gemini call streams over
SSE); the short link opens the recipient view; signed-in "my gardens" shows sent/received;
`/privacy`+`/terms` reachable from the footer; installable.

## 6. Cross-cutting (dashboard / one-time)

- **Login 403 (reported):** Cloudflare dashboard → Caching → **Purge Everything**, then retest in
  incognito. Root-caused to edge/browser cache from the broken-deploy window; server is healthy.
- **Web Analytics:** dashboard → Web Analytics → add each `*.aidenjang.com` site (cookieless; see
  [OBSERVABILITY.md](OBSERVABILITY.md)).
- **Uptime:** point a free external monitor at each `/health` (table in OBSERVABILITY.md).
- **Workers Logs:** confirm with `wrangler tail <worker>` on any app; browse in the dashboard.
- **Security headers:** `curl -sI <app>/health | grep -i content-security-policy` on each app.

## Rollback

Each Worker keeps prior versions in the Cloudflare dashboard (Workers → the worker → Deployments →
roll back). D1 migrations are forward-only here — the two Phase-5 owewell migrations are additive
(new nullable columns), so a Worker rollback stays compatible with the migrated schema.
