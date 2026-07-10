# platform API

The platform is a set of independent Cloudflare Workers, not one backend. Two exist today:

- **Auth service** — one shared Worker (`apps/auth`) that owns identity for the whole
  platform: the `/auth/*` API plus the login/account UI. Every app trusts it.
- **App Workers** — each app (in this repo, `apps/bloomnote`; others like owewell, wherever, and
  is-it-a-dog now live in their own repos) serves its SPA + API on its own origin under an
  app-specific prefix and trusts the auth service for identity.

Each app is its own Worker on its own origin (frontend + that app's API share the origin, so
the browser stays same-origin and no CORS is needed). Adding an app adds a Worker; it does not
touch the others. Auth is the one shared service so there is a single identity across apps.

## Base URLs

| Service | Production | Local |
| --- | --- | --- |
| Auth (`/auth/*`, `/health`, login UI) | `https://accounts.aidenjang.com` | `http://localhost:34100` |
| bloomnote (SPA + `/api/*`) | `https://bloomnote.aidenjang.com` | see `apps/bloomnote/DEPLOY.md` |

## Auth model

- Login and register set the session cookie **`platform_session`** (httpOnly, `SameSite=Lax`),
  scoped to `COOKIE_DOMAIN` (`.aidenjang.com`) so one login is valid across every
  `*.aidenjang.com` app.
- Apps never call the auth service from the browser. Instead:
  - Sign-in / sign-out are **full-page redirects** to the auth origin (`/login`, `/logout`
    with a `return_to`), so the cookie is set by a top-level navigation.
  - An app validates a request **server-side** by forwarding the incoming cookie to the auth
    service's `GET /auth/me` (see `@aidenjang/auth-client`). Each app surfaces the result at its
    own same-origin `/me` endpoint.
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

## Adding another app

1. Create `apps/<app>/api` as a new Hono Worker with its own D1 and its own origin, serving
   routes under an `/<app>/*` prefix.
2. Validate sessions with `@aidenjang/auth-client` against the shared auth service; do not add
   per-app login. Expose a same-origin `/<app>/me` for the frontend.
3. Redirect to the shared auth origin for sign-in/out (`loginUrl` / `logoutUrl`).
