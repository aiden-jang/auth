/*
 * Email constraints, not web ones: tables for layout, every style inlined, no images. A <style> block
 * is stripped by several clients, and a remote image is a tracking pixel and the first thing blocked.
 */

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

// Explicit cell backgrounds help email clients that invert light messages.
const INK = '#1d222a';
const MUTED = '#566171';
const LINE = '#d8dfe8';
const CANVAS = '#eef2f7';
const ACCENT = '#283e5c';

interface EmailAction {
  label: string;
  url: string;
}

/**
 * Required, never defaulted. A footer answering "why am I getting this" with the wrong reason is
 * worse than none: the reader is usually consulting it to decide whether the message is a fake.
 */
export type EmailReason = 'sign-in' | 'sign-up' | 'password-reset' | 'alert';

export interface EmailContent {
  reason: EmailReason;
  /** Without one, clients preview the first words of the body instead. */
  preheader: string;
  heading: string;
  /** Already escaped. */
  paragraphs: string[];
  action?: EmailAction;
  footnote?: string;
  facts?: { label: string; value: string }[];
  /**
   * The app they were reaching, named in the footer. The sender stays "aidenjang", so this is the
   * half they recognise. Falls back to the house name, and is ignored for an `alert`, which is
   * about the account rather than any one app.
   */
  app?: string | null | undefined;
}

export interface RenderedEmail {
  html: string;
  /** Text-only clients otherwise get raw markup, and a missing text part costs spam score. */
  text: string;
}

/** The whitespace padding is load-bearing: without it some clients run the preview into the body. */
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

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export function renderEmail(content: EmailContent): RenderedEmail {
  // Built twice, escaped only for the HTML part: the text part must stay literal.
  const appName = content.app ?? 'aidenjang';
  const why = (name: string): string => {
    switch (content.reason) {
      case 'sign-in':
        return `You are getting this because someone used this address to sign in to ${name}.`;
      case 'sign-up':
        return `You are getting this because this address was used to make an account on ${name}.`;
      case 'password-reset':
        return `You are getting this because somebody asked to reset the password for this address on ${name}.`;
      // No app name: a credential change is about the account, which is the same one everywhere.
      case 'alert':
        return 'You are getting this as a security notice for the account on this address.';
    }
  };
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${paragraph}</p>`,
    )
    .join('');

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(content.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CANVAS};">` +
    preheaderBlock(content.preheader) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="background:${CANVAS};padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-top:4px solid #aacbfa;border-radius:16px;">` +
    `<tr><td style="padding:28px 28px 0;font-family:${FONT};">` +
    // Text, not an image: it still shows when images are blocked, which is when somebody is deciding
    // whether to trust the message.
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
    // A button somebody cannot preview is a button somebody should not press.
    (content.action
      ? `If the button does not work, paste this into your browser:<br>` +
        `<span style="word-break:break-all;color:${MUTED};">${escapeHtml(content.action.url)}</span><br><br>`
      : '') +
    `${why(escapeHtml(appName))} This mailbox is not monitored.` +
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
    why(appName),
    'This mailbox is not monitored.',
  ].join('\n');

  return { html, text };
}

/** Body copy carries the odd `<strong>` and `<a>`. */
function stripTags(value: string): string {
  return value
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
        })[entity] ?? entity,
    );
}

/** UTC, named as such: the service knows the account's coarse location but not its timezone, and
 *  guessing wrong on a security alert is worse than being explicit. */
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
