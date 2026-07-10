# Observability

Three legs, all $0 on Cloudflare's free tier. One is code (Workers Logs, already enabled); the
other two are dashboard/external setup, documented here.

## 1. Workers Logs (error + request tracking) — enabled in code

Every worker's `wrangler.toml` has:

```toml
[observability]
enabled = true
head_sampling_rate = 1
```

- **Uncaught exceptions** are captured automatically. Handled errors are logged too — the API
  workers funnel through `app.onError` / `try/catch`, the ai-worker returns `vision_failed`, etc.
- **Live tail** during an incident: `pnpm --filter <worker> exec wrangler tail` (or
  `wrangler tail <name>`).
- **Browse + query** historically: Cloudflare dashboard → Workers & Pages → *the worker* → Logs
  (filter by status, exception, invocation). Retention is on the free tier.
- Drop `head_sampling_rate` below `1` only if a worker gets high enough traffic to matter (none do).

## 2. Web Analytics (traffic) — dashboard

Cloudflare **Web Analytics** is cookieless (hashes IP+UA at the edge) and free — so **no cookie
banner** is required (disclosed in the privacy policy, step 5.5).

Setup: dashboard → Web Analytics → add each site (`accounts` / `owewell` / `bloomnote` /
`is-it-a-dog` `.aidenjang.com`). For CF-proxied hostnames it auto-injects the beacon; if a
Worker-served response isn't auto-instrumented, paste the site's beacon into that app's
`index.html`:

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js"
        data-cf-beacon='{"token":"<site-token-from-dashboard>"}'></script>
```

(bloomnote's old `@vercel/analytics` was removed in 3.6; its typed `analytics.ts` event API is a
no-op stub, ready to wire to a Worker endpoint later if custom events are ever wanted.)

## 3. Uptime — external monitor on `/health`

Every worker exposes `GET /health` returning `{ status/ok, service }`. Cloudflare Health Checks
are a paid add-on, so point a **free external monitor** (e.g. UptimeRobot, 5-min interval) at:

| App | Health URL |
| --- | --- |
| auth | `https://accounts.aidenjang.com/health` |
| owewell | `https://owewell.aidenjang.com/health` |
| bloomnote | `https://bloomnote.aidenjang.com/health` |

A green `/health` proves the worker is reachable and its runtime is up; it does not exercise D1/KV
/DO, which surface via Workers Logs instead.
