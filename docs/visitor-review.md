# Visitor and real-device review

This walkthrough is prepared, not conducted. Automated checks use local synthetic accounts;
browser-engine emulation does not verify physical phones, native passkey prompts, or email delivery.

## A fresh visitor’s journey

Ask a person who has not used Accounts to narrate these tasks without coaching. Use a disposable
account for registration, recovery, or deletion, and keep email links and credentials out of recordings.

| Task                               | Observe                                                       | Status                          |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Start sign-in from an app          | Can they name the app they will return to?                    | Not tested with a fresh visitor |
| Choose a sign-in method            | Are password, Google, and available passkeys understandable?  | Not tested with a fresh visitor |
| Recover from a rejected password   | Do they understand the error and find recovery?               | Not tested with a fresh visitor |
| Request a reset link and return    | Is the email, new password, and destination journey clear?    | Not tested with a fresh visitor |
| Review devices and download a copy | Can they find the current device and understand the download? | Not tested with a fresh visitor |
| Explain account deletion           | Do they understand that app data is managed separately?       | Not tested with a fresh visitor |

Record where they pause, what they expect, and whether the task completes. Change wording or layout
in response to repeated confusion; do not infer user understanding from a passing browser assertion.

## Physical iPhone and Android checks

- Cold-load a sign-in link from another app. Check keyboard sizing, autofill, the security widget,
  and submit-button stability while the network is slow.
- Use Google and a passkey with a disposable account. Confirm the real OS prompt, cancellation,
  and return to the expected app. Test switching away and back during sign-in.
- Read a policy, follow its footer to the other policy, then navigate back. Check the new heading
  and starting position with VoiceOver or TalkBack as well as touch.
- Open settings, expand a device, rename it, refresh, and sign out a second test device. Check that
  the other device actually loses access; the list’s appearance alone is insufficient.
- Request a reset email, open it from the mail app, and complete the disposable account’s reset.
  Verify the old password no longer works and that the intended app destination survives.
- Download an account copy through the native browser. Confirm where it is saved and that only
  the intended account’s metadata appears.
- Before deleting a disposable identity, remove its app data in each app. Confirm that the deletion
  explanation is clear and that the removed identity can no longer sign in.

## Operational evidence

Use [observability](OBSERVABILITY.md) for request failures and [analytics](ANALYTICS.md) for aggregate
traffic and actions. Compare changes over a useful time window; browser counters are best effort and
do not establish unique visitors, retention, or completion rates. Record the date, device, browser,
connection, app destination, and observed outcome without copying private URLs, cookies, or email tokens.
