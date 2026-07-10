# auth deploy checklist

Deploy mechanics live in [../packages/auth-api/DEPLOY.md](../packages/auth-api/DEPLOY.md); this is the pre-flight,
the cross-cutting dashboard steps, and rollback.

> You run every credential-touching command (`wrangler deploy`, `wrangler secret put`,
> `d1 migrations apply --remote`). Nothing here needs my Cloudflare token.

## 1. Pre-flight

```bash
nvm use            # Node 22
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # green before shipping
```

## 2. Deploy

```bash
pnpm --filter @aidenjang/auth-api run deploy   # builds auth-web, then wrangler deploy
```

Verify: `curl -sI https://accounts.aidenjang.com/health` shows the security headers (CSP, HSTS,
`X-Content-Type-Options`); `/privacy` and `/terms` render; sign in, then sign out actually clears
the session; `/login` still works.

## 3. Cross-cutting (dashboard / one-time)

- **Web Analytics:** dashboard → Web Analytics → add `accounts.aidenjang.com` (cookieless; see
  [OBSERVABILITY.md](OBSERVABILITY.md)).
- **Uptime:** point a free external monitor at `/health` (see OBSERVABILITY.md).
- **Workers Logs:** confirm with `wrangler tail aidenjang-auth`; browse in the dashboard.
- **Security headers:** `curl -sI https://accounts.aidenjang.com/health | grep -i content-security-policy`.
- **Login 403 after a bad-deploy window:** dashboard → Caching → Purge Everything, retest incognito.

## Rollback

The Worker keeps prior versions in the dashboard (Workers → `aidenjang-auth` → Deployments → roll
back). D1 migrations are forward-only; keep them additive (new nullable columns) so a Worker
rollback stays compatible with the migrated schema.
