# October 14 Accounts review

The full capture run checked authentication, app return links, account settings, legal pages,
and failure recovery at 320, 390, 430, 768, and 1440 pixels wide. It reported no horizontal
overflow or browser page errors. The desktop and phone captures below were visually inspected.
All account identities and responses are synthetic; no production account was changed.

| View                         | Evidence                         |
| ---------------------------- | -------------------------------- |
| Sign-in and legal navigation | [Phone](login-390.png)           |
| Account sections             | [Desktop](account-1440.png)      |
| Profile editing              | [Phone](profile-edit-390.png)    |
| Long unbroken display name   | [Phone](profile-long-390.png)    |
| Security confirmation        | [Phone](security-dialog-390.png) |
| Account service outage       | [Phone](account-error-390.png)   |
| Passkey list outage          | [Phone](passkey-error-390.png)   |
| Failed sign-out              | [Phone](logout-error-390.png)    |

The recovery screens keep failures visible and offer a retry. Failed list loads do not imply
that an account has no devices or passkeys. Sign-out redirects only after confirmation from
the service. The security dialog receives focus, traps keyboard navigation, supports Escape,
and returns focus to its trigger; browser regressions cover those interactions separately.

Repeat the visual check with the web app running in e2e mode on port 34112 and
`node packages/web/scripts/capture-ui.cjs`. `AUTH_UI_URL` selects another local origin and
`AUTH_UI_OUTPUT` selects an evidence directory. The script mocks account responses;
`pnpm run verify` runs the real local-service journeys.
