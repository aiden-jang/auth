# Platform architecture

Each app has its own repository, release pipeline, storage and product boundary. Accounts
provides shared sign-in for the apps that need durable private account data. An entry in the
Accounts launcher does not imply that an app depends on its session service.

For the identity service itself, see [Accounts architecture](ARCHITECTURE.md),
[API](docs/API.md) and [security posture](docs/SECURITY.md).

## Applications and storage

| App                | Identity and access                                                   | Runtime and storage                                                                               |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Accounts (`auth`)  | Passwords, Google and passkeys; shared session                        | Worker, D1 identity/session records, Durable Object rate limits                                   |
| owewell            | Accounts for saved groups; public calculator and limited shared views | Worker, D1 ledger and live-group Durable Objects                                                  |
| Bloomnote          | Anonymous gift links; Accounts for the connected archive              | Worker, KV gardens, Durable Object counters                                                       |
| mrrp               | Private room/seat credentials; optional Accounts connection           | Worker and a Durable Object per room with durable state                                           |
| Worth              | Accounts for the private archive; explicit reviewed shares            | Worker, D1 records and private media                                                              |
| Wherever           | Room/participant credentials independent of Accounts                  | Worker, session Durable Objects, D1 and usage meters                                              |
| iguess             | Room/player reconnect credentials independent of Accounts             | Game Durable Objects with expiring checkpoints and a separate vision Worker                       |
| Everything Is Fine | Public, no account                                                    | Browser-rendered globe and direct public feeds; static assets and a small aggregate-events Worker |
| Portfolio          | Public, no account                                                    | Static Vite site on Vercel, with browser-rendered 3D                                              |

Each repository's README and architecture document own its current feature details. Real provider
calls, AI recognition, geocoding and mail have their own configuration and provider limits;
application counters do not replace provider quotas or billing controls.

## Shared sign-in

Accounts sets `platform_session` on `.aidenjang.com`, with `HttpOnly`, `Secure` and `SameSite=Lax`.
D1 stores the session token's hash. Frontend JavaScript cannot read the cookie. A participating
app's Worker receives the cookie and forwards it to `/auth/me` through the versioned
`@aidenjang/auth-client` package.

The SDK distinguishes `signed-in`, `signed-out` and `unavailable`. Preserve those outcomes:
an Accounts outage must not erase drafts, change account ownership or masquerade as a confirmed
sign-out. Apps own adoption and private data; deploying Accounts does not publish the SDK or
upgrade its consumers.

Accounts is required for Worth's private archive and Owewell's saved groups. Bloomnote's
anonymous gifts and mrrp's room links work independently of sign-in. Public reading,
calculators and local play have their own boundaries rather than a universal account rule.

## Trust and request boundaries

The parent-domain cookie makes deployed sibling origins part of one trust boundary. A sibling
Worker can receive the session secret in a request; `HttpOnly` protects it from browser scripts,
not from that Worker. Keep every sibling deployment trusted, validate sessions on the server,
and require recent proof for sensitive credential changes.

`SameSite=Lax` limits cross-site cookie use, but sibling subdomains are same-site. Accounts also
checks state-changing browser requests against its own origin and explicitly configured app
origins. Credentialed CORS controls browser response access and is not a substitute for that
request check. Server-to-server SDK calls without an Origin header remain supported.

OAuth callbacks require the stored state token. Return destinations are independently checked
in the browser and service; production handoffs use approved HTTPS hosts. Local handoffs stay
on HTTP(S) loopback destinations, and embedded URL credentials are rejected.

An app's UI is never authority for ownership, room roles, budgets or ledger arithmetic. The
Worker or Durable Object enforces those rules, including clients that send modified requests.
Private gift and room links are credentials; keep them out of public issues and captures.

## State, concurrency and recovery

Each live unit has an owning Durable Object. It coordinates sockets and mutations for its room,
group or counter. Async work can yield: use transactions, atomic storage operations and explicit
in-flight guards where multiple requests may interleave. One isolate alone does not make an
awaited read/modify/write sequence atomic.

D1 holds relational records and ownership. KV serves immutable or projected gift records;
mutable quota counters use Durable Objects. Local fixtures and storage stay isolated from
production. Database changes preserve applied migration history and include generated metadata
where the repository's migration tooling requires it.

Every app owns retry and draft recovery. A failed read is an unavailable result, not an empty
editable record. Delayed responses must not replace a newer route, account, room or operation.

## Independent releases and observability

The session contract is a published package so apps can deploy independently. A public SDK
change needs a version bump, compatibility checks and an authorized publish. Service CI does
not publish it automatically. Security headers are deployed with each app rather than fetched
from a shared runtime service.

Main pushes run each repository's checks and browser journeys before its existing Cloudflare
deployment. Portfolio CI and Vercel deployment are separate results. Preserve release ordering
and migration checks; do not bypass failing checks or rewrite deployed migration history.

Private apps send fixed aggregate categories and selected events to `aidenjang_events`; their
CSP blocks the automatic URL beacon. The public globe retains Cloudflare Web Analytics and
its event endpoint. Portfolio uses Vercel Analytics and Speed Insights with normalized URLs.
See [analytics](docs/ANALYTICS.md) and [observability](docs/OBSERVABILITY.md) for query and
operational boundaries. Authentication providers' raw token responses and production email
contents must not enter application logs. Credential-bearing dev mail is confined to loopback.
