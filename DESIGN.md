---
name: 'Accounts'
description: 'A light, focused account home for aidenjang apps.'
colors:
  accent: '#315fc4'
  canvas: '#f2f4f8'
  card: '#ffffff'
  ink: '#253349'
  muted: '#5d6b7e'
  line: '#d9e0e9'
  control-line: '#7d8ba1'
  paper-selected: '#e8efff'
  neg: '#a34443'
  pos: '#2d7254'
  brand-mark-background: '#14171c'
  brand-mark-ink: '#aacbfa'
typography:
  headline:
    fontFamily: "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: '32px'
    fontWeight: 500
    lineHeight: 1.16
    letterSpacing: '-0.035em'
  title:
    fontFamily: "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: '20px'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '-0.025em'
  body:
    fontFamily: "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: '-0.011em'
  label:
    fontFamily: "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: '14px'
    fontWeight: 500
    lineHeight: '20px'
  legal:
    fontFamily: "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.85
rounded:
  action: '8px'
  field: '9px'
  device: '10px'
  document: '12px'
  sheet: '16px'
  avatar: '50%'
  chip: 'calc(infinity * 1px)'
spacing:
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.card}'
    rounded: '{rounded.field}'
    padding: '12px 20px'
  button-outline:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.action}'
    padding: '10px 14px'
  button-google:
    textColor: '{colors.ink}'
    rounded: '{rounded.device}'
    padding: '10px 16px'
  button-destructive:
    backgroundColor: '{colors.neg}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.action}'
    padding: '10px 20px'
  button-text:
    textColor: '{colors.accent}'
    typography: '{typography.label}'
    rounded: '{rounded.action}'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '10px 14px'
  navigation-selected:
    backgroundColor: '{colors.paper-selected}'
    textColor: '{colors.accent}'
    rounded: '{rounded.action}'
    padding: '11px 14px'
  chip-unverified:
    textColor: '{colors.muted}'
    rounded: '{rounded.chip}'
    padding: '2px 10px'
  card-auth:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.sheet}'
    padding: '28px'
---

# Design System: Accounts

## Overview

**Creative North Star: "A focused account home"**

Cool ivory surrounds white forms, slate text and restrained blue actions. The existing key mark, bundled app icons and locally hosted DM Sans carry the identity. The approved light direction replaces the former split layout.

Keep the interface compact and readable. Thin dividers, quiet navigation and clear form labels carry the hierarchy. Security messages and destructive confirmations stay factual.

**Key Characteristics:**

- Light canvas, white forms and slate text.
- Blue actions and pale blue selection.
- Compact rows with visible labels and generous control targets.
- Existing key mark and recognizable app icons.

## Colors

The palette uses cool neutrals with one action accent. The frontmatter records the
shared values from `packages/web/src/index.css`.

### Primary

- **Account blue** (`accent`): primary actions, links and keyboard focus.
- **Pale selection blue** (`paper-selected`): selected navigation and initial avatars.

### Neutral

- **Cool ivory** (`canvas`): the page ground around forms and account content.
- **White** (`card`): forms, fields, headers and legal documents.
- **Slate ink** (`ink`) and **slate gray** (`muted`): content and supporting text.
- **Soft divider** (`line`): section boundaries and card edges.
- **Control slate** (`control-line`): input and outlined control boundaries.
- **Key charcoal** (`brand-mark-background`) and **key ice blue** (`brand-mark-ink`): the existing mark.

Status uses **muted red** (`neg`) for errors and deletion, and **forest green** (`pos`)
for positive feedback. Always pair status color with words or an icon.

**The Verified Destination Rule.** App accents and labels come from the verified app registry. Keep them local to the destination treatment; shared form actions retain account blue.

## Typography

DM Sans uses local regular, medium and bold files (400, 500 and 700), with the system
sans-serif fallback in the frontmatter. Headlines use medium weight rather than heavy display type.

- **Headline:** page titles; reduce to (29px) at the auth and account phone breakpoints.
- **Title:** section headings. Legal headings keep their reading line height (1.4).
- **Body:** supporting copy and account descriptions. Fields use larger text (16px).
- **Label:** visible field labels and compact actions. Supporting metadata uses (12px).
- **Legal:** document copy, with a tighter phone line height (1.8).

**The Visible Label Rule.** Keep labels visible after typing. Placeholders and password visibility controls supplement labels.

## Layout

Authentication uses a white header above a centered form column (480px maximum including
horizontal padding). Its white sheet sits below the destination and title. The header is
compact (76px, reducing to 72px on phones); legal links and credit share the footer.

The account workspace is capped at (1000px). A sticky section column (172px) sits beside
the content with a gap (40px). At (700px) and below, section links wrap above the content.
Keep Apps, Profile, Sign-in, Devices and Data as separate, addressable sections.

The app directory keeps two columns on phones. Icons and names remain visible; taglines
and trailing arrows are reserved for wider screens. Profile rows align labels and values;
name editing gets its own row. Device details expand inside their existing row.

Legal pages use a contents column (180px) beside a white reading surface within a container
(1080px maximum). At (600px) and below, an expandable contents list precedes the document.
Keep links underlined and derive contents from the document headings.

Auth phone adjustments begin at (600px). Below (360px), remove the form sheet border and
horizontal inset so the existing challenge fits without scaling. Respect safe-area insets,
wrap long identity text and keep controls reachable without horizontal scrolling.

## Elevation & Depth

Resting pages use flat surfaces, thin borders and tonal separation. The reauthentication
dialog alone uses a structural shadow (`0 18px 54px rgba(37, 51, 73, 0.16)`) over its dimmed,
blurred backdrop.

**The Flat Surface Rule.** Use borders and spacing for resting hierarchy. Reserve the dialog shadow for the reauthentication overlay.

## Shapes

Controls have modest rounded corners. Auth fields and primary buttons share the field
radius; account buttons and selected section links use the action radius. Larger form
sheets, legal documents and device rows use their own container radii. Initial avatars
are circular; the unverified status badge is a pill. Keep the existing key silhouette.

## Components

**Buttons.** Primary actions use account blue with white text. Google is an outlined
provider action with its existing mark. Outlined actions remain quiet; deletion uses red
in its confirmation. Plain text actions underline on hover. Retain disabled and busy
states. Account controls have a minimum target height (44px); auth fields and the Google
action are taller (48px).

**Fields.** White fields have a control-slate border, with an accent border and soft ring
on focus. The shared keyboard outline is visible (2px with a 2px offset). Keep password
visibility, autocomplete, error text, status announcements and the existing challenge.

**Navigation and identity.** Use pale blue behind the active account section, with
`aria-current`. Section changes preserve mounted drafts and move focus to the page heading
when appropriate. Callback and legacy links must reveal the section containing the action
or error. Remembered-account rows show a masked address and a separate Forget control;
remembering an address never implies authentication.

**Recovery and verification.** Keep validated destinations through email links and the
return to sign-in. Verification offers an explicit Continue to app link instead of an
automatic redirect. Preserve the policy wording and published update dates.

**Inline forms.** Closing profile, password, device-name and deletion forms returns focus
to the opening control. Clearing a password or deletion URL flag must keep the relevant
section selected after reload. Pending saves and deletion retain their form and disable
controls that would suggest the request can be canceled.

**Motion.** Keep the existing auth entrance (450ms, an 8px rise) and loading feedback.
Reduced-motion settings remove the entrance and shimmer. Keep section navigation immediate.

The self-contained previews in `.impeccable/design.json` capture these implemented
primitives. [Quality checks](docs/quality.md) records the current evidence and limits.

## Do's and Don'ts

### Do:

- Do keep the shared forms light and the primary actions blue.
- Do preserve visible labels, clear focus and factual security feedback.
- Do keep all app destinations visible on phones.
- Do retain drafts, return focus and reveal the relevant section for deep links.
- Do respect reduced motion, forced colors and safe-area insets.

### Don't:

- Don't restore the superseded split layout or dark form panels.
- Don't take destination branding from unverified URL values.
- Don't use color alone to communicate account status.
- Don't hide an action's callback error in an inactive section.
- Don't imply that an in-flight account change can be canceled.
