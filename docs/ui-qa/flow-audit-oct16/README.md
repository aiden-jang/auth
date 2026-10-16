# Safari flow review — October 16

Reviewed from `101025e` with the changes in this commit, using desktop Chromium and iPhone 13 WebKit emulation. The complete verification command passed, including the built Worker-served interface and the development-server journeys.

Cancelling a security confirmation returns focus to the action that opened it, including Safari taps that do not focus buttons. Passkey removal, Google disconnection and adding a password pass their actual trigger to the shared guard. The guard type has one owner.

The browser fixture preserves the configured viewport, touch settings and other context options while assigning an isolated local caller. The suite and CI now include iPhone-sized WebKit. Device-label assertions check the browser actually used.

Local development pins the Worker upstream to HTTP localhost. Safari otherwise refuses its Secure cookie and upgrades the built interface’s assets to an unavailable HTTPS listener. The asset-upgrade exception uses the existing secure-request policy: only plain HTTP on exact localhost or 127.0.0.1 is exempt. HTTPS loopback, real domains, HTTP requests on real domains, and lookalike loopback hostnames keep the upgrade directive. HSTS and the other CSP directives remain present. The regression check failed on both HTTP loopback cases before the fix and passed after it.

Verification and recovery email links were exercised through the isolated Worker’s dev-mail log. The live Google sign-in returned to Worth, and sibling apps recognized the shared session.

In a live follow-up, one approved password-reset email arrived in the intended Gmail inbox. Its “Choose a new password” link opened Accounts’ reset form with both password fields empty. No password was entered or changed, and no reset was submitted. This confirms recovery-email delivery and navigation; live verification-email delivery and reset submission remain untested. The capture excludes the recovery URL and token.

This is browser-engine emulation, not a physical iPhone check. Native password-manager UI, passkey enrollment, touch gestures and keyboard behavior still require an actual device. The passkey capture below uses synthetic account responses.

- [Phone account details](passkeys-phone.png)
- [Live recovery form](live-recovery-form.jpg)
