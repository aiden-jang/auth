# Quality checks

Run `pnpm run verify` before committing. [Contributing](../CONTRIBUTING.md)
describes the repository gates and local setup. Browser journeys use disposable
local data; they must not create production records.

For interface changes, compare desktop and phone views with the [design guide](../DESIGN.md).
Inspect keyboard focus, reduced motion, long content and empty/loading/error states.
Automated accessibility scans and browser emulation do not establish physical-device
behavior, native sharing or spoken screen-reader output. State unavailable checks.

Curated README images live in `docs/screenshots/`. They show the approved light Accounts
layout, use synthetic data and carry source metadata. They do not verify subsequent changes.

The account and legal continuation is shown in the [desktop account](screenshots/account-desktop.png),
[phone account](screenshots/account-phone.png), [desktop privacy](screenshots/privacy-desktop.png)
and [phone terms](screenshots/terms-phone.png) views. These captures use synthetic account details.
The legal browser checks follow the contents links on desktop and phone. Account journeys cover
profile editing, password changes, passkeys, device management, export and deletion through their
existing controls.

## Current redesign evidence

- All 12 resting screens had zero axe violations and no horizontal overflow at widths
  (320px, 390px, 768px and 1440px).
- The fresh visual review covered 32 desktop and phone captures. A later callback fix
  received a `ship` verdict with the listed fix resolved, using four additional captures.
  Review sizes were (1024px desktop and 390px phone).
- All 468 unit tests and six guard tests passed. The production build and dead-class
  check passed.
- All 140 browser checks passed across Chromium desktop and WebKit iPhone 13 emulation.
  Six targeted callback, deletion and signup checks also passed in both browsers.
- A follow-up update to Hono 4.13.16 cleared the dependency advisories. The security
  audit reported no known vulnerabilities, and `pnpm run verify` passed after the update.

The Impeccable detector could not run because its bundled engine was unavailable.
The screenshot review and automated browser checks do not establish physical-device
behavior, native sharing or spoken screen-reader output.

## Review artifacts

Keep generated screenshot sets, videos, traces and run reports in ignored
`test-results/` output or a temporary local directory. CI artifacts should expire.
Commit authored design references and a small curated set of README images only;
keep runtime and installation assets separate. Earlier audit records remain in Git
history. Use synthetic data and remove private information from shared evidence.
