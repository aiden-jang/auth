# Contributing

Start with the [README](README.md), [architecture](ARCHITECTURE.md), and repository
[conventions](CONVENTIONS.md). Use a branch and scope-free Conventional Commits, for example
`fix: preserve recovery drafts during reauthentication`.

## Before a PR

Run `pnpm run verify` with the pinned Node/pnpm versions. Keep the normal file/state ceilings and
comment budgets; extract cohesive modules rather than raising limits. Demonstrate a new regression
failing against the original fault or a targeted mutation, then restore temporary changes exactly.
Browser checks use local synthetic accounts, not production sessions. Put API regressions in
`packages/api/test/`, pure logic tests next to their module, and UI journeys in `packages/web/e2e/`.

Keep API/security/runbooks aligned with behavior. Do not put live test counts in maintained prose.
For UI changes, check keyboard access, busy/error/success states, and narrow screens, and record
sanitized evidence under `docs/ui-qa/`.

## Database changes

Generate migrations with `pnpm --filter @aidenjang/auth-api run db:generate`; commit SQL and its
snapshot/journal together. Never hand-edit a migration to fit a new schema. The migration guard
checks drift and restores the working journal byte-for-byte even when Drizzle fails. Deployment
applies pending D1 migrations before publishing code; prefer additive schema changes so rollback
remains compatible.

## Dependencies and Workers tests

Audit the full workspace with `pnpm run security:check`. The Workers test integration follows
[Cloudflare’s migration guidance](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/).
Its setup explicitly resets D1 and Durable Object state; removing that reset makes tests order-dependent.
The narrow `@esbuild-kit/core-utils>esbuild` override patches Drizzle’s legacy TypeScript loader;
verify migration generation before changing or removing it. Do not suppress audit findings.

## Publishing the SDK

`@aidenjang/auth-client` is installed by other repositories. A public-contract change requires its
own version bump, consuming-app compatibility checks, and an explicit publication step. Service CI
does not publish it. Build/test the package before an authorized release with
`pnpm --filter @aidenjang/auth-client run build` and `pnpm --filter @aidenjang/auth-client run test`.
Use npm’s supported publishing authentication; never copy tokens into commands, PRs, or logs.
