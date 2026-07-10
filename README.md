# auth

The shared identity service for my apps, on a Cloudflare-native stack with a hard **$0 hosting**
constraint and **no cold starts**. A small Worker at `accounts.aidenjang.com` issues a cookie that
every app trusts, and a published SDK (`@aidenjang/auth-client`) is the one place the session
contract lives.

## What's here

- **`apps/auth`** — the auth service. `api` is a Hono Worker (D1 sessions, Turnstile,
  per-IP rate limiting via a Durable Object) serving the `/auth/*` API + login/account UI; `web`
  is the React front end. Live at [accounts.aidenjang.com](https://accounts.aidenjang.com).
- **`packages/auth-client`** — `@aidenjang/auth-client`, **published to npm**: `loginUrl`/`logoutUrl`
  builders + the `AuthUser` session shape. Apps depend on this as a versioned package.
- **`packages/config`** — the strict shared tsconfig base (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) + flat ESLint config. Internal dev tooling.

## The apps that use it

Each is its own repo now and consumes `@aidenjang/auth-client`:

- [owewell](https://owewell.aidenjang.com) — split bills, settle up
- [wherever](https://wherever.aidenjang.com) — group restaurant swiping
- [is-it-a-dog](https://is-it-a-dog.aidenjang.com) — multiplayer draw-and-guess vs an AI
- [bloomnote](https://bloomnote.aidenjang.com) — write a note, an LLM grows someone a garden

## How auth works

The service sets a `platform_session` cookie on `.aidenjang.com` (httpOnly, `SameSite=Lax`), so one
login is valid across every `*.aidenjang.com` app. Apps never read the cookie in the browser — they
forward it to `/auth/me` from their own Worker via `@aidenjang/auth-client`, so the session secret
never touches app JavaScript. Sign-in and sign-out are full-page redirects to the auth origin.

Each app hardens its own responses (CSP/HSTS headers + a same-origin CSRF guard) with an inlined
`harden()` middleware rather than a shared package, since each app tunes its own CSP.

## Publishing `@aidenjang/auth-client`

It builds to `dist` (`tsc`) and publishes to npm; the app repos install it as a versioned dep. After
changing the session contract, bump the version and:

```bash
pnpm --filter @aidenjang/auth-client publish --access public
```

## Deploy

Auth runs on Cloudflare's free tier (Worker + D1). See [docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

## Docs

- [docs/API.md](docs/API.md) — the `/auth/*` API + the session model
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)
