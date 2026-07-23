import type { ReactNode } from 'react';

export interface PasswordRule {
  label: string;
  ok: boolean;
}

/**
 * Score a password 0-4 and return the requirement checklist. Full marks needs the four
 * character classes AND a little length, so a short "aB1!" reads as Good, not Strong.
 */
export function evaluatePassword(pw: string): { score: number; rules: PasswordRule[] } {
  const rules: PasswordRule[] = [
    { label: '8+ characters', ok: pw.length >= 8 },
    { label: 'a number', ok: /\d/.test(pw) },
    { label: 'a letter', ok: /[a-zA-Z]/.test(pw) },
    { label: 'a symbol', ok: /[^a-zA-Z0-9]/.test(pw) },
  ];
  let score = rules.reduce((n, r) => n + (r.ok ? 1 : 0), 0);
  if (score === 4 && pw.length < 12) score = 3;
  return { score, rules };
}

const LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];

/** Segmented strength bar + requirement checklist. Renders nothing for an empty field. */
export function PasswordStrength({ value }: { value: string }): ReactNode {
  if (!value) return null;
  const { score, rules } = evaluatePassword(value);
  const color =
    score <= 1 ? 'var(--color-neg)' : score === 4 ? 'var(--color-pos)' : 'var(--color-accent)';

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < score ? color : 'var(--color-line)' }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs font-medium" style={{ color }}>
        {LABELS[score]}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {rules.map((r) => (
          <li key={r.label} className={r.ok ? 'text-pos' : 'text-muted'}>
            {r.ok ? '✓' : '○'} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
