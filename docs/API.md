# platform API

One always-on Fastify backend serves every app. Endpoints fall into two groups:

- **Platform-level** (shared by all apps) live at the API **root**: liveness and auth.
- **App-level** (one app's business logic) live under that app's **prefix** (`API_PREFIX`,
  e.g. `/owewell`), so multiple apps never collide.

Auth is platform-level on purpose: there is one identity for the whole platform, so it must
not sit under any single app's prefix.

## Base URLs

| Environment | Auth + health (root) | App routes (owewell) |
| --- | --- | --- |
| Production | `https://api.aidenjang.com` | `https://api.aidenjang.com/owewell` |
| Local (direct) | `http://localhost:30000` | `http://localhost:30000/owewell` |
| Local (via web dev proxy) | `http://localhost:30001` | `http://localhost:30001/owewell` |

`API_PREFIX` is set to `/owewell` in every environment (local `.env` / docker-compose and the
prod deployment) so dev matches prod and multiple apps with overlapping entity names never
collide. The schema default is `/api` for a brand-new app that hasn't set one yet.

## Auth model

- Session cookie `platform_session` (httpOnly, `SameSite=Lax`), set on login/register.
- Cross-origin: the frontend calls with `credentials: 'include'`; the API allows the
  configured `CORS_ORIGINS`. The cookie is scoped to `COOKIE_DOMAIN` (`.aidenjang.com`) so
  one login is valid across every `*.aidenjang.com` app.
- Protected endpoints return `401` without a valid session. "Auth" column below: **public**
  = no session needed, **session** = requires the cookie.

---

## Platform-level (root, unprefixed)

### Health

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness + DB readiness: `{ status, db, uptime }` |

### Auth — `/auth/*`

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `{ email, password, displayName }` → sets session, returns `{ user }` |
| POST | `/auth/login` | public | `{ email, password }` → sets session, returns `{ user }` |
| POST | `/auth/logout` | session | Clears the session |
| GET | `/auth/me` | session | `{ user }` for the current session |
| PATCH | `/auth/me` | session | `{ displayName }` → `{ user }` |
| POST | `/auth/change-password` | session | `{ currentPassword, newPassword }` |
| POST | `/auth/forgot-password` | public | `{ email }` → always `200` (no account enumeration) |
| POST | `/auth/reset-password` | public | `{ token, newPassword }` |

---

## App-level — owewell (`/owewell/*` in all environments)

Paths below are shown relative to the app prefix. Full URL = base + prefix + path
(e.g. `https://api.aidenjang.com/owewell/groups`).

### Groups

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/groups` | session | Your groups; each includes `netCents` (your net in that group) |
| POST | `/groups` | session | `{ name }` → `{ group }` |
| GET | `/groups/:id` | session | Group detail + members |
| PATCH | `/groups/:id` | session (owner) | `{ name }` → rename |
| DELETE | `/groups/:id` | session (owner) | Delete group and its ledger |
| GET | `/groups/:id/balances` | session | Net balance per member |
| POST | `/groups/:id/members` | session | `{ email }` (real account) or `{ name }` (placeholder person) |
| DELETE | `/groups/:id/members/:userId` | session | Remove a member / leave |

### Expenses

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/groups/:id/expenses` | session | List expenses |
| POST | `/groups/:id/expenses` | session | `{ description, amountCents, payerId, splitMethod, participants }`; `splitMethod` ∈ `EQUAL \| EXACT \| PERCENT \| SHARES` |
| POST | `/groups/:id/expenses/itemized` | session | `{ description, payerId, taxCents, tipCents, items[] }` (line items with `participantIds`) |
| DELETE | `/groups/:id/expenses/:expenseId` | session | Soft-delete; balances recalculate |
| POST | `/groups/:id/ocr` | session | `multipart/form-data` receipt image → extracted `{ items, taxCents, tipCents }` |

### Settlements

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/groups/:id/suggested-payments` | session | Minimal who-pays-whom to clear balances |
| GET | `/groups/:id/settlements` | session | Settlement history (powers the activity feed) |
| POST | `/groups/:id/settlements` | session | `{ fromUserId, toUserId, amountCents }` → record a payment |

### Invites

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/groups/:id/invites` | session | Create a shareable invite link → `{ token }` |
| GET | `/invites/:token` | public | Preview an invite (group name) before joining |
| POST | `/invites/:token/accept` | session | Join the group via the link |

### Quick split

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/quick-splits` | session | Save a logged-out quick split into a real group → `{ groupId }` |

---

## Realtime

- WebSocket at **`/ws`** (root). Authenticated by the `platform_session` cookie.
- Emits group-change events; the frontend re-fetches the ledger on receipt so open
  sessions stay live. Configure the client with `VITE_WS_URL` (e.g. `wss://api.aidenjang.com/ws`).

## Adding another app

1. Add the app's route modules under `packages/server/src/modules/<app>/` and register them
   in the prefixed block in `app.ts`.
2. Give it its own prefix (its own `API_PREFIX` deployment, or a distinct sub-prefix).
3. Reuse the shared `/auth/*` and `/health` (no per-app auth). Add the app's frontend origin
   to `CORS_ORIGINS`.
