# Passkey details and high contrast

Long passkey labels wrap without clipping. Used passkeys show both relative usage
and a visible date and time in the reader’s local format. Unused passkeys keep the
existing “not used yet” label. Authentication and removal requirements are unchanged.

- [Desktop](details2-passkeys-1440-none.png)
- [Phone](details2-passkeys-390-none.png)
- [Desktop with forced colors](details2-passkeys-1440-active.png)
- [Phone with forced colors](details2-passkeys-390-active.png)

The isolated browser fixture uses a deliberately long multilingual label and
different creation and last-used dates. The timestamp assertion was checked
against a deliberately wrong creation-date substitution, then restored and passed.
High contrast is emulated in Chromium; actual assistive technology and device
passkey prompts remain device checks.

High-contrast selections use a heavier bottom rule while labels retain native
system text colors. This avoids text backplates obscuring a filled selection.
