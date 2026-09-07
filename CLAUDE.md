# Working in this repo

Planning, commits and how to explain things live in the global `~/.claude/CLAUDE.md`. This file is
what is true _here_: the patterns to follow, the smells that actually shipped, and the gates that
catch what judgment did not.

## Before you say anything is done

```bash
pnpm verify
```

Twelve gates. The deploy job is gated on them, so a red gate means nothing ships.

`pnpm verify:fast` is the same list without build, tests and the browser suite. That is what the
pre-commit hook and the Stop hook in `.claude/settings.json` run, in about 13 seconds. Neither
replaces `pnpm verify`; they only stop obviously-broken work being committed or declared finished.

Always `pnpm run <name>`, and never name a script after an npm command. A script called `docs` was
shadowed by npm's own `docs`, which exits 0 without running anything, so that gate reported green
for a day while never executing. `pnpm run gates` now fails on the bare form.

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

`comments`, `size`, `docs` and `migrations` are local scripts in `scripts/`. Each exists because it caught
a real defect. Read the script before deciding a failure is spurious.

## Do not trust your own measurements

Most of the false statements made while building this repo came from scans that measured nothing,
not from misreading code:

- A python `glob` with `{src,test}` braces matched zero files, so a coverage sweep compared against
  an empty string and reported every module untested.
- A `cd` inside a backgrounded command did not apply, so three "stability runs" ran nothing.
- `@vitest/coverage-v8` reported 0% for everything, because it cannot instrument the Workers pool.
- `pnpm docs` silently resolved to npm's own command, so that gate reported green for a day without
  ever executing.

So: an empty or suspiciously clean result means suspect the scan first. A count next to a green
suite that looks impossible (0% coverage, 68 untested files) is the tool being wrong. And **green is
not proof unless you have seen that check fail**: break the thing it guards, watch it go red, then
believe it.

## Writing a new gate

- It has to cover its own source. `scripts/` was outside the comment gate's glob, so the gates
  accumulated unchecked prose, including a budget comment that had become an inaccurate changelog.
- It has to cover every place the failure can appear, not just where you first saw it. The
  shadowed-script check read `package.json` while the failure had surfaced in `ci.yml`.
- Exclude test files from source scans. Tests mount throwaway routes and declare throwaway types.
- Prove it fails before trusting it, and prove the failure leaves the tree clean.

## Numbers in prose

Do not write live counts into docs: test totals, gate totals, file lengths. Nothing checks them and
they go stale silently, and three were already wrong when this file was written. Say what a thing is
and let the gate print the number. Describing a past change is different, and fine.

## Follow the patterns already here

A change that invents its own shape is harder to read than a worse change that matches its
neighbours. What this repo settled on:

- **Routes** are one module per concern in `src/routes/`, each its own Hono instance mounted in
  `index.ts`. A new route joins an existing group; it does not go in `index.ts`.
- **What routes share** lives in `src/http/context.ts`: rate limiting, the step-up gate, the two
  refusal helpers. Nothing route-specific goes there.
- **Refusals** use `unauthenticated(c)` and `rateLimited(c)`, never a fresh object literal. Apps
  switch on `error`, so a typo is invisible here and breaks them.
- **Shared UI state** goes in a hook (`lib/useSessions.ts`) when two components act on it, not in
  the parent with props threaded down. Two copies of one truth is the bug.
- **Account page sections** are components in `components/`, each owning its own state.
- **Tests**: DB-backed in `packages/api/test/`, pure next to the module in `src/`.

## Smells that actually happened here

Each of these shipped and was found later. They are the ones to look for:

- **A literal repeated across call sites.** The two refusal bodies were written out in 39 places.
  Anything a caller matches on belongs in one function.
- **The same fact paraphrased in several files.** The lockout chain was explained three times in
  three wordings, which no text-matching check can see. One module owns a fact; the others point
  at it.
- **A component owning another's state.** The device list and the security banner both acted on
  sessions, so one could show a device the other had revoked.
- **A test that passes while measuring nothing.** A rate-limit test that never tripped the limit,
  an assertion that held by coincidence, a mutation caught by `noUnusedLocals` rather than by the
  test. Break the code to prove the test bites.
- **A guard on one side only.** `safeAppRedirect` was fixed on the server while `safeReturnTo` in
  the browser kept the same hole for hours. When two layers enforce one rule, change both.
- **A comment left behind by a move.** Seven of them after one refactor, one claiming a defence the
  route did not have.

## Comments

The countable rule first, because "don't add unnecessary comments" needs judgment that is worst
right after writing the code:

- **Never raise `SRC_BUDGET` to fit prose.** Trim instead. No script can enforce this about itself.
- Keep an inline comment to a line or two. A longer block has to earn it by recording something a
  reader would otherwise rediscover the hard way: a trap that has bitten, a real outage written
  down, a constraint that fails silently. A couple of dozen blocks here run longer than that and
  they are mostly the good ones, so length is not the test. "Why, not what" is. The gates are
  scored the same way: `scripts/` is a share of its own source rather than a count, precisely so a
  gate can arrive documented.
- Never explain a refactor, or what the code used to do. A reader never saw that version.
- A comment that logs successive changes is a changelog. Git has it, and the log will drift out of
  step with the value it describes -- this file's own budget comment did.
- After moving code, re-read every comment near the seam. A stranded one here claimed an
  enumeration defence on a route that has none.
- Report the number `pnpm comments` prints rather than asserting the comments are fine.

### When one is warranted, make it readable

Short is the goal; understandable is the constraint. A comment a reader has to parse twice failed,
however brief. Write what a colleague would say over your shoulder:

- **Lead with the hazard, in the imperative.** "Don't swap this for X: it…" beats "Not X: it…".
  A "not X" label states what the code is; the reader needs aiming at the change they are about to
  make.
- **One idea per sentence. Do not stack.** Three facts joined by "so" and "and" force a re-read.
  Split them, or drop the ones that only restate the code.
- **Plain subject and verb.** "Keep the checkbox outside the trigger" beats "The grow wrapper is
  what right-aligns the slot count."
- **Name the mechanism concretely.** "would be undone by the next pull" means nothing to someone
  who did not just write it.

Keep, at any length: silent-failure traps, security reasoning, incident postmortems, cache and
immutability constraints. `auth/stepUp.ts` is the model: two real outages, written down.

## Size

A god-file accretes twenty lines at a time and no single diff looks wrong, so the ceiling is the
gate rather than a review habit. `AccountPage.tsx` sits just under its ceiling, so the next feature
there means extracting something first, which is the intent. Split rather than raising a ceiling.

## Tests

- Prove a new test bites: break the code it covers and watch it fail. Tests here have passed while
  measuring nothing: a rate-limit test that never tripped, an assertion that held by coincidence.
- DB-backed tests go in `packages/api/test/` (they need `cloudflare:test`); pure ones sit next to
  their module in `src/`. Both are typechecked.
- The browser suite starts its own worker and vite. It reads verification and reset links out of
  the worker's dev log, because only the hash of a token is ever stored.

## Migrations

Never hand-write one. `pnpm --filter @aidenjang/auth-api db:generate`, then commit the SQL **and**
the snapshot under `migrations/meta/`. A missing snapshot leaves drizzle diffing an older schema, so
the next generate re-creates tables that already exist and the deploy fails on apply, and the deploy
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
