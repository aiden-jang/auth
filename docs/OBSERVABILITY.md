# Observability

Three legs, all $0 on Cloudflare's free tier. One is code (Workers Logs, already enabled); the
other two are dashboard/external setup, documented here.

## 1. Workers Logs (error + request tracking): enabled in code

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

## 2. Web Analytics (traffic): dashboard

Cloudflare **Web Analytics** is cookieless (hashes IP+UA at the edge) and free, so **no cookie
banner** is required (disclosed in the privacy policy, step 5.5).

Setup is done: the `aidenjang.com` zone has one site, and Cloudflare injects its beacon into every
proxied HTML response, Worker-served ones included. That single site collects every hostname under
the zone, so each app's numbers come from its hostname filter rather than a site of its own.

Do not paste a manual beacon snippet in as well. `beacon.min.js` initialises once per page, so a
second copy no-ops and its site sits at zero, which reads exactly like broken analytics.

The CSP still has to allow `https://static.cloudflareinsights.com` in `script-src`, since the
injected script is what does the reporting.

## 3. Uptime: external keyword monitors

Cloudflare Health Checks are a paid add-on, so point a **free external monitor** (e.g.
UptimeRobot, 5-min interval) at each app. Use keyword monitors: every URL below answers 200 even
when the thing behind it is broken, so a status-code check would sit green through an outage.

| App              | Monitor URL                                 | Keyword                 |
| ---------------- | ------------------------------------------- | ----------------------- |
| auth             | `https://accounts.aidenjang.com/health`     | `"service":"auth"`      |
| bloomnote        | `https://bloomnote.aidenjang.com/health`    | `"service":"bloomnote"` |
| iguess           | `https://iguess.aidenjang.com/health`       | `"service":"iguess"`    |
| owewell          | `https://owewell.aidenjang.com/health`      | `"service":"owewell"`   |
| wherever         | `https://wherever.aidenjang.com/api/health` | `"source":"google"`     |
| mrrp             | `https://mrrp.aidenjang.com/api/health`     | `"ok":true`             |
| everythingisfine | `https://everythingisfine.aidenjang.com/`   | `Everything Is Fine`    |

The path is not uniform, and that is not an oversight: wherever and mrrp serve everything under
`/api/*` and their health sits there, while `/health` at the root would be answered by the SPA
fallback. everythingisfine has no Worker at all, so its page is the only thing to check.

wherever's keyword is deliberately `"source":"google"` rather than `"ok":true`. It reports `mock`
when the Places key is missing, so the monitor covers the key as well as the worker.

A green health check proves the worker is reachable and its runtime is up; it does not exercise
D1/KV/DO, which surface via Workers Logs instead.
