# Working in this repo

The house rules (planning, commits, explaining, comment philosophy) live in the global
`~/.claude/CLAUDE.md`. This file is only what is true _here_, and mostly what is countable —
the rules that failed in this repo were the ones that needed judgment.

## Before you say anything is done

```bash
pnpm verify
```

Ten gates. The deploy job is gated on them, so a red gate means nothing ships.

| gate                 | rejects                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `typecheck`          | covers `src` **and** `test` in every package                                        |
| `lint`               | react-hooks and react rules on the SPA, floating promises in the Workers            |
| `knip`               | an export nothing imports                                                           |
| `comments`           | over budget, the same comment in two files, a comment stranded by a move            |
| `docs`               | a route missing from `docs/API.md`, or a doc pointing at a path that does not exist |
| `migrations`         | schema changed with no migration, or a migration committed without its snapshot     |
| `format:check`       | generated drizzle snapshots are ignored; everything a person wrote is checked       |
| `build` `test` `e2e` | the unit suites, then the browser journey against the built SPA                     |

`comments`, `docs` and `migrations` are local scripts in `scripts/`. Each exists because it caught
a real defect. Read the script before deciding a failure is spurious.

## Comments

Countable, because "don't add unnecessary comments" needs judgment that is worst right after
writing the code:

- No comment block over four lines. If one seems necessary, ask.
- **Never raise `SRC_BUDGET` to fit prose.** Trim instead. No script can enforce this about itself.
- Never explain a refactor, or what the code used to do. A reader never saw that version.
- After moving code, re-read every comment near the seam. A stranded one here claimed an
  enumeration defence on a route that has none.
- Report the number `pnpm comments` prints rather than asserting the comments are fine.

## Tests

- Prove a new test bites: break the code it covers and watch it fail. Tests here have passed while
  measuring nothing — a rate-limit test that never tripped, an assertion that held by coincidence.
- DB-backed tests go in `packages/api/test/` (they need `cloudflare:test`); pure ones sit next to
  their module in `src/`. Both are typechecked.
- The browser suite starts its own worker and vite. It reads verification and reset links out of
  the worker's dev log, because only the hash of a token is ever stored.

## Migrations

Never hand-write one. `pnpm --filter @aidenjang/auth-api db:generate`, then commit the SQL **and**
the snapshot under `migrations/meta/`. A missing snapshot leaves drizzle diffing an older schema, so
the next generate re-creates tables that already exist and the deploy fails on apply — the deploy
runs migrations before it publishes.

## Publishing `@aidenjang/auth-client`

Four apps in other repos install this, so a change is a publish and a version bump, not a deploy.
See the README for the npm token it needs.

## Deliberate, do not "fix"

- `harden.ts` is copied into each app rather than shared, so no Worker is unsafe because something
  else failed to deploy. This repo's copy is the reference.
- Registration answers `409` on a taken email. That does enumerate, and it is the accepted price of
  a usable sign-up. `forgot-password` is always `200` and must stay that way.
- `/auth/me` must stay `no-store`: it depends on who is asking and the only `Vary` is Origin.
- `getSessionUser` stays alongside `resolveSession` for the apps still on it.
- Loopback redirects are allowed only when the app's own origin is loopback. Both
  `safeAppRedirect` (server) and `safeReturnTo` (browser) enforce it; they must agree.
