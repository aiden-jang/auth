# Reset-link recovery

Expired or invalid password-reset links offer a replacement request as the primary action,
carrying the destination app through the request. A service outage keeps both
password fields available for retry and does not call the link invalid.

The browser journey checks the failure distinction, recovery destination, narrow
layouts and existing email autocomplete hint. Accounts verifies email through a
link; there is no verification-code input to add paste handling to.

- [Desktop](reset-recovery-1440.png)
- [Phone](reset-recovery-390.png)

The review uses local responses and emulated viewports. Native password-manager
prompts, physical-device keyboards and spoken screen-reader output remain device
checks.
