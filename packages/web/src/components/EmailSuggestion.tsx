import type { ReactNode } from 'react';

const DOMAIN_FIXES: Record<string, string> = {
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotnail.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'icloud.co': 'icloud.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
};

/** Suggest only high-confidence corrections. Guessing at uncommon domains can lock someone out. */
function correctedEmail(value: string): string | null {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const corrected = DOMAIN_FIXES[domain];
  return corrected ? `${local}@${corrected}` : null;
}

export function EmailSuggestion({
  value,
  onAccept,
}: {
  value: string;
  onAccept: (value: string) => void;
}): ReactNode {
  const suggestion = correctedEmail(value);
  if (!suggestion) return null;

  return (
    <p className="mt-1.5 text-xs text-muted" role="status">
      Did you mean{' '}
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {suggestion}
      </button>
      ?
    </p>
  );
}
