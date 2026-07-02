# platform API

The platform is a set of independent Cloudflare Workers, not one backend. Two exist today:

- **Auth service** — one shared Worker (`apps/auth`) that owns identity for the whole
  platform: the `/auth/*` API plus the login/account UI. Every app trusts it.
- **owewell** — the app Worker (`apps/owewell/api`) that serves owewell's SPA and its
  business API under the `/owewell/*` prefix, on owewell's own origin.

Each app is its own Worker on its own origin (frontend + that app's API share the origin, so
the browser stays same-origin and no CORS is needed). Adding an app adds a Worker; it does not
touch the others. Auth is the one shared service so there is a single identity across apps.

## Base URLs

| Service | Production | Local |
| --- | --- | --- |
| Auth (`/auth/*`, `/health`, login UI) | `https://accounts.aidenjang.com` | `http://localhost:34100` |
| owewell (SPA + `/owewell/*`) | `https://owewell.aidenjang.com` | web `http://localhost:30001` (proxies `/owewell` → API `:34200`) |

## Auth model

- Login and register set the session cookie **`platform_session`** (httpOnly, `SameSite=Lax`),
  scoped to `COOKIE_DOMAIN` (`.aidenjang.com`) so one login is valid across every
  `*.aidenjang.com` app.
- Apps never call the auth service from the browser. Instead:
  - Sign-in / sign-out are **full-page redirects** to the auth origin (`/login`, `/logout`
    with a `return_to`), so the cookie is set by a top-level navigation.
  - An app validates a request **server-side** by forwarding the incoming cookie to the auth
    service's `GET /auth/me` (see `@aidenjang/auth-client`). owewell surfaces the result at its
    own same-origin `GET /owewell/me`.
- Protected endpoints return `401` without a valid session. "Auth" column below: **public** =
  no session needed, **session** = requires the cookie.

---

## Auth service — `apps/auth`

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness: `{ status, service }` |
| POST | `/auth/register` | public | `{ email, password, displayName }` → sets session, returns `{ user }` |
| POST | `/auth/login` | public | `{ email, password }` → sets session, returns `{ user }` |
| POST | `/auth/logout` | session | Clears the session |
| GET | `/auth/me` | public | `{ user }` for the current session, or `401` if signed out |
| POST | `/auth/forgot-password` | public | `{ email }` → always `200` (no account enumeration) |
| POST | `/auth/reset-password` | public | `{ token, newPassword }` |
| POST | `/auth/verify-email` | public | `{ token }` → marks the address verified |
| POST | `/auth/resend-verification` | session | Re-sends the verification email |

Register and login are rate-limited per IP (a `RateLimiter` Durable Object).

---

## owewell — `apps/owewell/api` (`/owewell/*`)

Full URL = owewell origin + path (e.g. `https://owewell.aidenjang.com/owewell/groups`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness: `{ status, service }` |
| GET | `/owewell/me` | public | `{ user, personId }` for the caller, or `{ user: null }` when signed out |

### Groups

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/owewell/groups` | session | Your groups; each includes `memberCount` and `netCents` (your net in that group) |
| POST | `/owewell/groups` | session | `{ name }` → `{ group }` |
| GET | `/owewell/groups/:id` | session | Group detail + members |
| PATCH | `/owewell/groups/:id` | session (owner) | `{ name }` → rename |
| DELETE | `/owewell/groups/:id` | session (owner) | Delete group and its ledger |
| GET | `/owewell/groups/:id/balances` | session | Net balance per member |
| POST | `/owewell/groups/:id/members` | session | `{ name }` adds a name-only placeholder. `{ email }` returns `501` — real accounts join via an invite link. |
| DELETE | `/owewell/groups/:id/members/:personId` | session | Remove a member / leave |

### Expenses

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/owewell/groups/:id/expenses` | session | List expenses |
| POST | `/owewell/groups/:id/expenses` | session | `{ description, amountCents, payerId, splitMethod, participants }`; `splitMethod` ∈ `EQUAL \| EXACT \| PERCENT \| SHARES` (PERCENT values are basis points, 10000 = 100%) |
| POST | `/owewell/groups/:id/expenses/itemized` | session | `{ description, payerId, taxCents, tipCents, items[] }` (line items with `participantIds`) |
| DELETE | `/owewell/groups/:id/expenses/:expenseId` | session | Soft-delete; balances recalculate |
| POST | `/owewell/groups/:id/ocr` | session | `multipart/form-data` receipt image → extracted `{ items, taxCents, tipCents }` |

### Settlements

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/owewell/groups/:id/settlements` | session | Settlement history (powers the activity feed) |
| GET | `/owewell/groups/:id/settlements/suggested` | session | Minimal who-pays-whom to clear balances |
| POST | `/owewell/groups/:id/settlements` | session | `{ fromUserId, toUserId, amountCents, method? }` → record a payment (`method` ∈ `venmo \| paypal \| zelle \| cash \| other`) |
| DELETE | `/owewell/groups/:id/settlements/:settlementId` | session | Undo a recorded payment |

### Invites

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/owewell/groups/:id/invites` | session | Create a shareable invite link → `{ invite: { token } }` |
| GET | `/owewell/invites/:token` | public | Preview an invite (group name, status) before joining |
| POST | `/owewell/invites/:token/accept` | session | Join the group via the link |

### Quick split

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/owewell/quick-splits` | session | Save a signed-out quick split into a real group → `{ groupId }` |

### Realtime

- WebSocket at **`/owewell/groups/:id/ws`**, authenticated by the `platform_session` cookie
  and gated on group membership before the upgrade is routed.
- Each group is a `GroupRoom` Durable Object (hibernatable, so idle rooms cost nothing). It
  pushes `group:changed` on any mutation; the client re-fetches the ledger on receipt.

## Adding another app

1. Create `apps/<app>/api` as a new Hono Worker with its own D1 and its own origin, serving
   routes under an `/<app>/*` prefix.
2. Validate sessions with `@aidenjang/auth-client` against the shared auth service; do not add
   per-app login. Expose a same-origin `/<app>/me` for the frontend.
3. Redirect to the shared auth origin for sign-in/out (`loginUrl` / `logoutUrl`).
