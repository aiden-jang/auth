# Accounts review — October 26

Reviewed from `77fff29` with the changes in this commit. This is a repository and browser review;
the [visitor walkthrough](../../visitor-review.md) remains prepared, not conducted.

## Observed failures and fixes

- Privacy’s footer opened Terms at the old scroll position, with its heading outside the viewport
  in Chromium and WebKit. Internal path changes now start at the top and focus the new heading,
  while form autofocus remains intact. The router owns history restoration while mounted so a late
  native Back restore cannot overwrite that position. The existing history journey covers both.
- A successful Turnstile retry enabled submission while leaving the previous failure and reload
  action visible. Success clears that failure. Reserving the documented standard widget height also
  prevents its arrival from moving the submit button; the original desktop jump measured 32.5 px.
  The revised fixture also caught the original 65 px jump on phone WebKit without blocking page load.
- A device refresh started before sign-out could restore the removed device when its response
  arrived late. Request order and successful mutation revisions now guard list updates and status
  messages. The same guard protects renames and signing out other devices.
- Save name used white on the house accent, measuring only 1.66:1 text contrast in the browser.
  It now uses the shared primary treatment. The destructive confirmation uses dark text on its
  rose fill. The regression reads the rendered colors rather than assuming classes imply contrast.
- Account exports omitted registered passkeys from their sign-in methods and metadata. The
  account-scoped export now includes labels, backup status, and timestamps, excluding credential
  IDs and keys. A second account’s key is explicitly excluded by the test.

The navigation, recovery, layout-stability, stale-response, contrast, and export regressions were
observed failing before their respective fixes. Original registration, recovery, session ownership,
step-up, deletion, and security boundaries remain exercised by the existing suite.

## Dependencies and structure

The full audit initially reported seven vulnerabilities. Patched Zod, Workers tooling, Undici, and
Vitest resolve the affected dependency paths; the linter’s existing compatible Zod dependency was
refreshed rather than forced through a major-version override. The final audit reports no known
vulnerabilities. No SDK runtime change or package publication is included.

The initial web bundle measured 277.88 kB, 86.92 kB compressed by Vite. This review does not claim a
loading-time improvement: its measured loading fix removes a widget-driven layout shift. No new
runtime dependency, CI job, rendering layer, or speculative architecture split was added.

The UI ownership boundaries remain coherent. The session hook owns asynchronous device state,
shared shells own focusable headings, the router owns path transitions, and the API export selects
only the current account’s safe metadata. Comments, unused code, source size, migration drift, and
docs paths are checked by the existing gates. The unused empty passkey import was removed.

## Browser evidence and limits

The responsive pass checked sign-in, registration, forgotten/reset password, account, and both
policy routes at 320, 390, 768, and 1440 px in Chromium and WebKit. No horizontal overflow or page
errors were found. Policy navigation changed from an off-screen heading to scroll position zero and
heading focus at every checked width. Production-layout captures use synthetic accounts and a local
widget fixture with Cloudflare’s documented 300 × 65 px footprint; they do not solve a real challenge.

- [Desktop sign-in](login-1440.png)
- [Phone sign-in](login-390.png)
- [Phone device editing](device-edit-390.png)
- [Phone account deletion](account-deletion-390.png)
- [Phone policy navigation](policy-navigation-390.png)
- [Sanitized measurements](measurements.json)

The policy copy now distinguishes Worth’s private archive from signed-out app use, documents
passkeys and essential authentication handshakes, and explains separate app-data deletion. The
README, architecture, contributor guidance, and deployment runbook describe direct owner pushes
and the existing parallel CI jobs; browser artifacts are retained on failure.

GitHub’s existing main rule permits direct maintenance commits, requires linear history, applies to
administrators, and blocks force pushes and branch deletion. Dependency alerts, grouped security
updates, CodeQL default setup, private vulnerability reporting, and secret push protection were
confirmed enabled without changing settings. The existing verification and browser jobs still gate
deployment; no new pipeline was added.

Physical phones, native password managers/passkey ceremonies, live email submission, and actual
fresh visitors were not tested in this pass. Local synthetic journeys do not establish those outcomes.

## Final verification

`pnpm run verify` passed, including the full dependency audit, types, lint, unused-code checks,
source/comment/CSS/docs/migration guards, production builds, guard tests, all unit/API/SDK tests,
and both browser engines. The final browser run passed without retries. The comments gate reported
622/699 source comment lines, no duplicates, and no stranded comments. No ceilings or budgets were raised.

An earlier full run caught the late native Back restoration and a WebKit-only deadlock in the first
loading fixture. The router now owns restoration, and the fixture delays widget content without
holding page load open. The corrected fixture was proved against the original layout fault in both
engines before the final successful full run.
