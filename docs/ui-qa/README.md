# Accounts UI verification

The [design](../DESIGN.md) uses an independent slate and ice-blue identity with cool paper,
a cute key illustration and locally bundled DM Sans. The account
hub has a wider app grid and consistent section spacing. Worth is now in the app registry
and its verified return destination is labeled on sign-in.

`packages/web/scripts/capture-ui.cjs` uses isolated browser responses, without writing account data or sending email.
It checks login, Worth return context, signup, forgotten/reset password, email verification,
account, privacy and terms at 1440/390/320/430/768px. Desktop captures use 1440 × 900;
phone captures use 390 × 780, with natural scrolling. All screens pass overflow and page-error
checks. Reduced motion freezes the existing entrance for inspection.

The PNGs record the implemented composition. Policy wording and authentication behavior remain
unchanged; security reviews, errors and destructive actions stay factual. App accents remain
verified and contrast-adjusted. Icons and their PNG fallbacks are regenerated together.

To repeat the visual checks, start web on port 34112 in e2e mode, then run `node packages/web/scripts/capture-ui.cjs`.
Use `AUTH_PLAYWRIGHT_MODULE` and `AUTH_BROWSER_PATH` to select an installed browser if needed.
The browser tests in `pnpm run verify` exercise the actual local service separately.

The earlier browser-suite attempts exposed a local port conflict and an absent required browser.
During the independent palette pass, the local worker exited after its health check; the
browser suite was restarted before final verification. No production deployment is
part of this change.

`pnpm run verify` passed every gate through build and unit tests on October 10. Its browser
phase was interrupted by the local worker crash; the separate `pnpm --filter @aidenjang/auth-web run e2e`
retry passed the real journeys for registration, verification, account editing, sessions,
password recovery, exports and deletion.
The contrast suite checks all registered app accents against the new palette. The comments gate
reported 688/699 source comment lines; no duplicated or stranded comments were found.
Screens were inspected after the independent Accounts palette and compact form headings. Worth’s local fake-auth service was
restored after the browser suite released its port.
