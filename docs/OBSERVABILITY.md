# Observability

Three legs, all $0 on Cloudflare's free tier. One is code (Workers Logs, already enabled); the
other two are dashboard/external setup, documented here.

## 1. Workers Logs (error + request tracking) — enabled in code

`packages/api/wrangler.toml` has:

```toml
[observability]
enabled = true
head_sampling_rate = 1
```

- **Uncaught exceptions** are captured automatically. Handled ones are logged too: everything the
  routes do not catch themselves funnels through `app.onError`, which logs it with the request id
  and answers a generic 500 rather than leaking a stack trace from the identity service.
- **Live tail** during an incident: `pnpm --filter <worker> exec wrangler tail` (or
  `wrangler tail <name>`).
- **Browse + query** historically: Cloudflare dashboard → Workers & Pages → _the worker_ → Logs
  (filter by status, exception, invocation). Retention is on the free tier.
- Drop `head_sampling_rate` below `1` only if a worker gets high enough traffic to matter (none do).

## 2. Web Analytics (traffic) — dashboard

Cloudflare **Web Analytics** is cookieless (hashes IP+UA at the edge) and free — so **no cookie
banner** is required (disclosed in the privacy policy, step 5.5).

Setup is done: the `aidenjang.com` zone has one site, and Cloudflare injects its beacon into every
proxied HTML response, Worker-served ones included. That single site collects every hostname under
the zone, so each app's numbers come from its hostname filter rather than a site of its own.

Do not paste a manual beacon snippet in as well. `beacon.min.js` initialises once per page, so a
second copy no-ops and its site sits at zero, which reads exactly like broken analytics.

The CSP still has to allow `https://static.cloudflareinsights.com` in `script-src`, since the
injected script is what does the reporting.

## 3. Uptime — external monitor on `/health`

Every worker exposes `GET /health` returning `{ status/ok, service }`. Cloudflare Health Checks
are a paid add-on, so point a **free external monitor** (e.g. UptimeRobot, 5-min interval) at:

| App  | Health URL                              |
| ---- | --------------------------------------- |
| auth | `https://accounts.aidenjang.com/health` |

A green `/health` proves the worker is reachable and its runtime is up; it does not exercise D1/KV
/DO, which surface via Workers Logs instead.
