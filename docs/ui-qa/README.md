# Accounts UI verification

The [design](../DESIGN.md) replaces the purple aurora and gradient controls with matte
olive, cream and butter, a cute key illustration and locally bundled DM Sans. The account
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

The initial browser-suite attempts exposed a local port conflict and an absent required browser.
These environment issues were resolved before final verification. No production deployment is
part of this change.

Final `pnpm run verify` passed on October 10, including the real browser journeys for
registration, verification, account editing, sessions, password recovery, exports and deletion.
The contrast suite checks all registered app accents against the new palette. The comments gate
reported 688/699 source comment lines; no duplicated or stranded comments were found.
Screens were inspected after the final font/border changes. Worth’s local fake-auth service was
restored after the browser suite released its port.
