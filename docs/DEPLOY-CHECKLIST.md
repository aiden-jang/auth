# Deployment and recovery

## Automatic deployment

Merge a verified PR to main. CI runs repository/unit/build checks and browser journeys in parallel;
both must pass. It retains the production web artifact and browser evidence. The deployment job
uses that artifact, applies pending D1 migrations, and then publishes the Worker. It never publishes
the SDK. Details of provider flags and bindings are in [the API runbook](../packages/api/DEPLOY.md).

## Before merging

- Run `pnpm run verify` using the pinned Node and pnpm versions.
- Review any API/session-contract change against consuming apps and the published SDK.
- Include generated migration SQL, snapshots and journal entries for schema changes.
- Confirm required CI and security scans pass for the current PR head.

## Verify after deployment

Check `/health`, the authentication screens and legal routes. Confirm the build’s Google option and
security challenge are configured together with the Worker’s provider secrets. Use local synthetic
accounts for automated sign-in/recovery/mutation tests; production account actions need a deliberate
manual test plan. Correlate unexpected API failures with the returned `x-request-id`, without logging
session cookies or email tokens.

## Failed pipeline or manual recovery

Inspect the failed job before retrying. A migration failure blocks deployment on purpose. Use the
API runbook’s manual procedure only when automatic deployment is unavailable; it preserves migration
ordering. Do not bypass checks or run a bare deploy against a schema that has not migrated.

## Rollback

Use the prior Worker version in Cloudflare’s deployment history. D1 migrations are forward-only:
prefer additive changes and check that the previous Worker can run against the migrated schema.
A Worker rollback does not restore deleted account data or undo a database migration.
