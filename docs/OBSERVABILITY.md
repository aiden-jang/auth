# Observability

Workers Logs and aggregate analytics are configured in code. Error alerts and
active uptime checks need separate dashboard setup and verified notification
delivery; enabling logs alone does not notify anyone.

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

## 2. Aggregate traffic and product events

Private apps report fixed page categories to the shared `aidenjang_events` Analytics
Engine dataset through an anonymous first-party endpoint. Accounts, Owewell, Bloomnote, Wherever, mrrp, iguess and Worth block the automatic
Web Analytics URL beacon through their Content Security Policy: its full-path
collection would record private room, share and record identifiers. The free
Cloudflare plan can still inject the script, but the browser must refuse to run it. Native rate limiting has a separate analytics
bucket. No URL, query, fragment, note, name or account identifier is sent in these events.

The public portfolio keeps Vercel Analytics/Speed Insights, with URLs normalized to
its home page. The public everythingisfine globe keeps Cloudflare Web Analytics and
adds fixed usage events to Analytics Engine; its permalink fragments are not collected
by the Cloudflare beacon. Do not inject a second traffic beacon.

See [Analytics](ANALYTICS.md) for schemas, privacy choices and the dashboard query.
`pnpm events [days]` reads the shared dataset using sample-weighted counts. Browser
counters are best effort and must not be treated as unique people or exact retention.

## 3. Uptime: external keyword monitors

Cloudflare's free plan does not include active Health Checks. A free external
service such as [UptimeRobot](https://uptimerobot.com/pricing/) supports keyword
checks every five minutes. Use both a successful HTTP response and the expected
content below: a wrong health path can return the SPA with status 200.

| App              | Monitor URL                                 | Keyword                 |
| ---------------- | ------------------------------------------- | ----------------------- |
| auth             | `https://accounts.aidenjang.com/health`     | `"service":"auth"`      |
| worth            | `https://worth.aidenjang.com/api/health`    | `"status":"ok"`         |
| bloomnote        | `https://bloomnote.aidenjang.com/health`    | `"service":"bloomnote"` |
| iguess           | `https://iguess.aidenjang.com/health`       | `"service":"iguess"`    |
| owewell          | `https://owewell.aidenjang.com/health`      | `"service":"owewell"`   |
| wherever         | `https://wherever.aidenjang.com/api/health` | `"source":"google"`     |
| mrrp             | `https://mrrp.aidenjang.com/api/health`     | `"ok":true`             |
| everythingisfine | `https://everythingisfine.aidenjang.com/`   | `Everything Is Fine`    |
| portfolio        | `https://www.aidenjang.com/`                | `Aiden Jang`            |

The path is not uniform, and that is not an oversight: wherever and mrrp serve everything under
`/api/*` and their health sits there, while `/health` at the root would be answered by the SPA
fallback. everythingisfine has no data API (its Worker only accepts aggregate analytics), so its page is the only thing to check.

wherever's keyword is deliberately `"source":"google"` rather than `"ok":true`. It reports `mock`
when the Places key is missing. This verifies the configured source, not that a
live Places search succeeds.

A green health check proves that endpoint is reachable and returns its expected
content. It does not exercise signed-in journeys, D1/KV/Durable Objects, email
delivery or third-party searches. Failures there need log review and separate
journey checks. Never include private room, share or record URLs in an external
monitor.

### Error alerts complement uptime checks

[Cloudflare Monitors](https://developers.cloudflare.com/notifications/monitors/)
can query observed HTTP traffic for repeated 5xx responses. Restrict the query to
the app hostnames, use a short evaluation window and limit repeat notifications.
For example, three server errors in a five-minute window with hourly repeats is
a low-noise starting point for these apps.

This only covers requests visible to Cloudflare. It cannot detect an idle outage
or guarantee coverage of a DNS-only hostname hosted elsewhere, including the
portfolio. Keep active external checks for every app. Verify each rule's preview,
delivery destination and a test notification before treating alerting as working;
do not deliberately break production to trigger it. Email addresses and provider
credentials belong in the provider dashboard, not this repository.
