/*
 * One shell for every email this service sends.
 *
 * They were bare `<p>` fragments: no document, no charset, no plain-text alternative, and an ISO
 * timestamp printed at whoever opened it. Most clients render a fragment, in Times New Roman, on white,
 * with the inbox preview line showing whatever the first sentence happened to be. For the only mail a
 * person ever gets from their identity provider, "looks like nothing and might be a phish" is the wrong
 * first impression, and a recognisable one is a small anti-phishing measure in itself.
 *
 * The constraints are email's, not the web's, so this is deliberately old-fashioned: tables for layout,
 * every style inlined, no external stylesheet, no webfont and no images. An image would need hosting and
 * would silently become a tracking pixel; a `<style>` block is stripped by several clients. Everything
 * here survives Gmail, Outlook and Apple Mail without a fallback path.
 */

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

/*
 * Colours picked to survive a dark inbox.
 *
 * Clients that "helpfully" invert a light email do it badly, so the shell commits to a light card with
 * explicit backgrounds on every cell rather than inheriting anything. The accent is the house purple,
 * darkened: #8b7bff is chosen against a near-black app background and fails contrast on white.
 */
const INK = '#1a1725';
const MUTED = '#5f5a70';
const LINE = '#e6e3ef';
const CANVAS = '#f5f4f8';
const ACCENT = '#5b4bd6';

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailContent {
  /** The inbox preview line. Without one, clients show the first words of the body instead. */
  preheader: string;
  heading: string;
  /** Body paragraphs, already escaped. Kept as an array so the layout owns the spacing. */
  paragraphs: string[];
  action?: EmailAction;
  /** Small print under the action, e.g. how long a link lasts. */
  footnote?: string;
  /** Label/value rows for the device, place and time on a security alert. */
  facts?: { label: string; value: string }[];
}

export interface RenderedEmail {
  html: string;
  /** Every message gets one. Text-only clients otherwise receive raw markup, and a missing text part
   *  is one of the cheapest things a spam filter scores against. */
  text: string;
}

/**
 * The preheader.
 *
 * Hidden in the body and repeated as whitespace, which is the standard trick: without the padding some
 * clients run on into the real body text and show "Confirm your emailaidenjang Confirm your email".
 */
function preheaderBlock(preheader: string): string {
  return (
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">` +
    `${escapeHtml(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}` +
    `</div>`
  );
}

/** A bulletproof button: a table, because Outlook ignores padding on an anchor. */
function actionBlock(action: EmailAction): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">` +
    `<tr><td align="center" bgcolor="${ACCENT}" style="border-radius:9999px;">` +
    `<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 30px;font-family:` +
    `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;` +
    `font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px;">` +
    `${escapeHtml(action.label)}</a>` +
    `</td></tr></table>`
  );
}

function factsBlock(facts: { label: string; value: string }[]): string {
  const rows = facts
    .map(
      (fact) =>
        `<tr>` +
        `<td style="padding:6px 14px 6px 0;font-size:13px;color:${MUTED};white-space:nowrap;">` +
        `${escapeHtml(fact.label)}</td>` +
        `<td style="padding:6px 0;font-size:13px;color:${INK};font-weight:600;">` +
        `${escapeHtml(fact.value)}</td>` +
        `</tr>`,
    )
    .join('');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:20px 0;border:1px solid ${LINE};border-radius:12px;padding:6px 16px;width:100%;">` +
    rows +
    `</table>`
  );
}

const FONT =
  `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export function renderEmail(content: EmailContent): RenderedEmail {
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${paragraph}</p>`,
    )
    .join('');

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Tells a dark-mode client the design already handles both, so it does not invert it badly.
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(content.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CANVAS};">` +
    preheaderBlock(content.preheader) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="background:${CANVAS};padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;">` +
    `<tr><td style="padding:28px 28px 0;font-family:${FONT};">` +
    // A wordmark in text rather than an image: no hosting, no tracking pixel, and it still shows when
    // images are blocked, which is exactly when somebody is deciding whether to trust the message.
    `<div style="font-size:13px;font-weight:700;letter-spacing:0.02em;color:${ACCENT};">aidenjang</div>` +
    `<h1 style="margin:12px 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${INK};">` +
    `${escapeHtml(content.heading)}</h1>` +
    paragraphs +
    (content.facts ? factsBlock(content.facts) : '') +
    (content.action ? actionBlock(content.action) : '') +
    (content.footnote
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${MUTED};">${content.footnote}</p>`
      : '') +
    `</td></tr>` +
    `<tr><td style="padding:20px 28px 26px;font-family:${FONT};">` +
    `<div style="border-top:1px solid ${LINE};padding-top:16px;font-size:12px;line-height:1.6;color:${MUTED};">` +
    // The link is spelled out because a button somebody cannot preview is a button somebody should not
    // press, and because clients that block the button's styling still leave this usable.
    (content.action
      ? `If the button does not work, paste this into your browser:<br>` +
        `<span style="word-break:break-all;color:${MUTED};">${escapeHtml(content.action.url)}</span><br><br>`
      : '') +
    `You are getting this because someone used this address to sign in to aidenjang. ` +
    `This mailbox is not monitored.` +
    `</div></td></tr></table></td></tr></table></body></html>`;

  const text = [
    content.heading,
    '',
    ...content.paragraphs.map(stripTags),
    ...(content.facts ? ['', ...content.facts.map((fact) => `${fact.label}: ${fact.value}`)] : []),
    ...(content.action ? ['', `${content.action.label}: ${content.action.url}`] : []),
    ...(content.footnote ? ['', stripTags(content.footnote)] : []),
    '',
    '--',
    'You are getting this because someone used this address to sign in to aidenjang.',
    'This mailbox is not monitored.',
  ].join('\n');

  return { html, text };
}

/** Body copy carries the odd `<strong>` and `<a>`; the text part needs neither. */
function stripTags(value: string): string {
  return value
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * A time a person can read, in UTC.
 *
 * The old templates printed `at.toISOString()`, which is a developer's timestamp: nobody reading "was
 * this you?" wants to parse `2026-08-12T15:04:05.123Z`. UTC and labelled as such, because the service
 * knows the account's coarse location but not its timezone, and quietly guessing wrong on a security
 * alert is worse than being explicit.
 */
export function readableTime(at: Date): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return `${formatted} UTC`;
}
