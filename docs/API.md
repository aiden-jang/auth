# auth API

The auth service (`packages/api`) is one shared Cloudflare Worker that owns identity for all of my
apps: the `/auth/*` API plus the login/account UI. Every app trusts it.

Each app is its own Worker on its own origin in its own repo. An app validates a request by
forwarding the session cookie to this service and consuming `@aidenjang/auth-client`; the apps
never talk to each other. The README lists which ones do that today. See "Adding another app"
below for the integration pattern.

## Base URLs

| Service                               | Production                       | Local                    |
| ------------------------------------- | -------------------------------- | ------------------------ |
| Auth (`/auth/*`, `/health`, login UI) | `https://accounts.aidenjang.com` | `http://localhost:34100` |

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

## Auth service — `packages/api`

| Method | Path                        | Auth    | Rate | Notes                                               |
| ------ | --------------------------- | ------- | ---- | --------------------------------------------------- |
| GET    | `/health`                   | public  |      | Liveness: `{ status, service }`                     |
| POST   | `/auth/register`            | public  | ✓    | `{ email, password, displayName }` → sets session   |
| POST   | `/auth/login`               | public  | ✓    | `{ email, password }` → sets session                |
| POST   | `/auth/logout`              | public  |      | Clears the session; harmless without one            |
| GET    | `/auth/me`                  | session |      | `{ user, sudoUntil }`, or `401` signed out          |
| POST   | `/auth/forgot-password`     | public  | ✓    | `{ email }` → always `200` (no account enumeration) |
| POST   | `/auth/reset-password`      | public  | ✓    | `{ token, newPassword }`                            |
| POST   | `/auth/verify-email`        | public  |      | `{ token }`, spent on first use                     |
| POST   | `/auth/resend-verification` | session | ✓    | Re-sends to the address on the account              |
| POST   | `/auth/update-profile`      | session |      | `{ displayName }`                                   |
| GET    | `/auth/export`              | session |      | A copy of the account's data, credentials excluded  |

### Proving the session again

Anything that changes how the account signs in needs a session that proved itself in the last 10
minutes, and answers `403 REAUTH_REQUIRED` otherwise. See [SECURITY.md](SECURITY.md).

| Method | Path                      | Auth    | Rate | Notes                                                        |
| ------ | ------------------------- | ------- | ---- | ------------------------------------------------------------ |
| POST   | `/auth/reauth`            | session | ✓    | `{ password }` → re-opens the window                         |
| POST   | `/auth/change-password`   | session | ✓    | `{ currentPassword, newPassword }`; the old one is the proof |
| POST   | `/auth/set-password`      | step-up | ✓    | For an account that signs in with Google only                |
| POST   | `/auth/disconnect-google` | step-up | ✓    | Refused if it would leave no way in                          |
| POST   | `/auth/delete-account`    | step-up | ✓    | Password, or the email typed out for a passwordless account  |

### Google

| Method | Path                    | Auth   | Rate | Notes                                                                    |
| ------ | ----------------------- | ------ | ---- | ------------------------------------------------------------------------ |
| GET    | `/auth/google`          | public |      | Redirect to consent; `?link=1` attaches to a live session                |
| GET    | `/auth/google/callback` | public |      | Verifies `state` and the token's audience; refuses an unverified address |

### Passkeys

| Method | Path                              | Auth    | Rate | Notes                                            |
| ------ | --------------------------------- | ------- | ---- | ------------------------------------------------ |
| GET    | `/auth/passkeys`                  | session |      | The caller's own keys                            |
| POST   | `/auth/passkeys/register/options` | step-up | ✓    | Starts the ceremony                              |
| POST   | `/auth/passkeys/register/verify`  | step-up |      | Completes it; mails the owner                    |
| POST   | `/auth/passkeys/login/options`    | public  | ✓    | Identical whether or not an account exists       |
| POST   | `/auth/passkeys/login/verify`     | public  | ✓    | Signs in; refuses a regressed counter as a clone |
| POST   | `/auth/passkeys/rename`           | session |      | `{ id, label }`, scoped to the owner             |
| POST   | `/auth/passkeys/delete`           | step-up |      | Scoped to the owner; mails them                  |

### Devices

| Method | Path                           | Auth    | Rate | Notes                                    |
| ------ | ------------------------------ | ------- | ---- | ---------------------------------------- |
| GET    | `/auth/sessions`               | session |      | Signed-in devices, newest activity first |
| POST   | `/auth/sessions/rename`        | session |      | `{ id, label }`, scoped to the owner     |
| POST   | `/auth/sessions/revoke`        | session |      | `{ id }`, scoped to the owner            |
| POST   | `/auth/sessions/revoke-others` | session |      | Keeps this device signed in              |

The Rate column marks what a `RateLimiter` Durable Object caps per IP.

## Adding another app

New apps live in their own repo and integrate with auth as a client:

1. `pnpm add @aidenjang/auth-client`, and build the app as a Cloudflare Worker on its own origin.
2. Validate sessions **server-side** by forwarding the incoming `platform_session` cookie to this
   service's `/auth/me`; never add per-app login. Expose a same-origin `/me` for the frontend.
3. Redirect to the shared auth origin for sign-in/out with `loginUrl` / `logoutUrl` (+ `return_to`).
4. Add the app's origin to auth's `CORS_ORIGINS` if it calls `/auth/*` cross-origin.
