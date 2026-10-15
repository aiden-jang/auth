# Accounts API deployment

The routine path is a verified PR merged to main. CI downloads the web bundle that passed checks,
applies pending migrations to `aidenjang-identity`, then deploys `aidenjang-auth`. It stops if migration
application fails. The existing GitHub token needs both Workers script editing and D1 editing.

For the complete process and rollback, see [the deployment checklist](../../docs/DEPLOY-CHECKLIST.md).

## Configuration

Bindings and the custom domain live in `wrangler.toml`. Local secrets belong in ignored `.dev.vars`.
Production secrets are managed in the Worker dashboard or an authenticated Wrangler session; never
extract a saved credential or paste a secret in a command history.

| Setting                                    | Purpose                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `APP_URL`                                  | Accounts UI origin used for email and redirect URLs                     |
| `COOKIE_DOMAIN`                            | Shared production cookie domain; omit locally for a host-only cookie    |
| `CORS_ORIGINS`                             | Explicit comma-separated app origins allowed to use browser credentials |
| `EMAIL_FROM`, `RESEND_API_KEY`             | Mail sender and delivery provider credential                            |
| `TURNSTILE_SECRET`                         | Server challenge verification; pairs with the public web site key       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth server configuration                                       |

The CI build supplies `VITE_GOOGLE_ENABLED=true` and the public `VITE_TURNSTILE_SITE_KEY`.
Server provider secrets stay on the Worker. Keep frontend flags and server configuration paired;
a server challenge without the corresponding widget blocks login and recovery. Google’s callback
is `/auth/google/callback` on the auth Worker origin.

## Manual recovery

From the repository root, run complete verification first. An authorized manual deployment uses
`pnpm --filter @aidenjang/auth-api run deploy`, which builds the UI, migrates D1, then deploys.
Provide the same public build flags as CI. `deploy:assets` is for CI’s already-verified artifact;
it does not build the UI. Avoid a bare Wrangler deployment that skips pending migrations.

## Local development

Build the web app and apply local migrations before starting the Worker. The README’s API command
sets `APP_URL` to the local web origin. With no provider keys, mail is logged and the local bot
challenge is unconfigured; production configuration is independent. Workers’ password-hashing limit
is recorded beside the hashing parameters in `src/auth/password.ts`.
