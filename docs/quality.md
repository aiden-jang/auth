# Quality checks

Run `pnpm run verify` before committing. [Contributing](../CONTRIBUTING.md)
describes the repository gates and local setup. Browser journeys use disposable
local data; they must not create production records.

For interface changes, compare desktop and phone views with the [design guide](DESIGN.md).
Inspect keyboard focus, reduced motion, long content and empty/loading/error states.
Automated accessibility scans and browser emulation do not establish physical-device
behavior, native sharing or spoken screen-reader output. State unavailable checks.

Curated README images live in `docs/screenshots/`. They use synthetic data and describe
the Quiet split layout; they do not verify every subsequent change.

The account and legal continuation is shown in the [desktop account](screenshots/account-desktop.png),
[phone account](screenshots/account-phone.png), [desktop privacy](screenshots/privacy-desktop.png)
and [phone terms](screenshots/terms-phone.png) views. These captures use synthetic account details.
The legal browser checks follow the contents links on desktop and phone. Account journeys cover
profile editing, password changes, passkeys, device management, export and deletion through their
existing controls.

## Review artifacts

Keep generated screenshot sets, videos, traces and run reports in ignored
`test-results/` output or a temporary local directory. CI artifacts should expire.
Commit authored design references and a small curated set of README images only;
keep runtime and installation assets separate. Earlier audit records remain in Git
history. Use synthetic data and remove private information from shared evidence.
