# Accounts architecture

## Runtime and trust boundary

One Worker serves the built UI and `/auth/*` API on the Accounts origin. Request IDs, security
headers, origin controls, and no-store authentication responses sit above the route groups in
`packages/api/src/index.ts`. Health and password-manager discovery are separate from account data.

The browser holds an HttpOnly session cookie. D1 stores its hash; `auth/session.ts` validates expiry
and account ownership. Other app Workers forward the cookie through `@aidenjang/auth-client` and
receive `signed-in`, `signed-out`, or `unavailable`. Those outcomes must not be collapsed. The SDK’s
published contract is tested independently and is versioned separately from the service.

Production cookies span the parent domain: sibling apps share a trust boundary. CORS does not
replace session checks or recent-proof requirements. Only configured app origins and the Accounts
origin may make credentialed browser requests. Server-to-server callers need no Origin header.

## API ownership

| Module                | Owns                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `src/routes/`         | One concern per route group: signup, password, sessions, account, Google, passkeys, discovery |
| `src/http/context.ts` | Shared refusals, session lookup, rate limiting, step-up and credential notifications          |
| `src/auth/`           | Cookie/token/password/session primitives and OAuth/WebAuthn validation                        |
| `src/db/schema.ts`    | Identity schema; generated SQL and snapshots live in `migrations/`                            |
| `src/rateLimiter.ts`  | Fixed-window counters in a Durable Object per action/address                                  |
| `src/emailLayout.ts`  | HTML and plain-text mail layout; user-provided values are escaped at interpolation            |
| `src/requestId.ts`    | Safe public errors and log correlation                                                        |

Route handlers validate input and ownership before changing state. Credential changes that could
lock someone out require recent proof; password changes supply their own current-password proof.
Migrations run before deployed code, and their SQL/snapshot history stays additive.

## UI ownership

`AccountPage` composes the signed-in hub. `AccountProfile` owns editing, copying, and verification
feedback; `PasswordSection`, `ConnectedAccounts`, `PasskeyList`, `SessionList`, `ExportAccount`, and
`DeleteAccount` own their respective interactions. `useSessions` shares the device list with the
security-review banner so revocation cannot leave two conflicting lists on screen.

`useStepUp` suspends the original action until confirmation or cancellation. Cancelling returns an
explicit incomplete result; confirming resumes the original caller, including its error handler.
The portal dialog isolates background controls, traps focus, and restores focus to its trigger.

`lib/api.ts` retains response codes, bounds requests, rejects malformed success responses, and
translates transport failures. Only a confirmed unauthorized response redirects account access to
sign-in. Failed logout, verification, passkey listing, and reset requests keep an explicit recovery
path. A failed request never manufactures an empty list or a successful credential change.

`lib/returnTo.ts` validates redirects; the server enforces the matching boundary in `auth/google.ts`.
Return context survives sign-in and email flows, including password-manager links. App colors and
labels come from the verified registry, scoped to the authentication card rather than the hub.

## Validation and deployment

Pure helpers and the published SDK run under Vitest. API tests use `@cloudflare/vitest-plugin`, real
D1 migrations, and local Durable Objects. Setup clears account rows and counters between tests;
outbound provider calls are intercepted and real local secrets are neutralized.

Playwright owns local server lifecycles and exercises real account journeys, server/API contracts,
recovery failures, keyboard access, and the built production flags. UI captures use synthetic
responses and include narrow-screen overflow checks. See [UI evidence](docs/ui-qa/README.md).

CI runs core checks and browser journeys independently. Both gate automatic main deployment. The
core job builds production assets with the public provider flags; deployment downloads that bundle,
applies D1 migrations, and publishes without rebuilding it. Security scanning and required PR checks
are configured in GitHub; [the deployment runbook](docs/DEPLOY-CHECKLIST.md) covers recovery.
