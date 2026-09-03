# auth deploy checklist

Deploy mechanics live in [../packages/api/DEPLOY.md](../packages/api/DEPLOY.md); this is the pre-flight,
the cross-cutting dashboard steps, and rollback.

> You run every credential-touching command (`wrangler deploy`, `wrangler secret put`,
> `d1 migrations apply --remote`). Nothing here needs my Cloudflare token.

## 1. Pre-flight

```bash
nvm use            # Node 22
pnpm install
pnpm verify        # typecheck, lint, knip, comments, formatting, build, tests, browser suite
```

## 2. Deploy

Merging to `main` deploys. CI runs the same checks and then ships, so the normal path is a merge
and nothing typed here.

Deploy by hand only when CI cannot: it applies pending D1 migrations and then publishes, in that
order, which is why a Workers-only API token is not enough.

```bash
pnpm --filter @aidenjang/auth-api run deploy   # builds auth-web, migrates D1, then wrangler deploy
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
