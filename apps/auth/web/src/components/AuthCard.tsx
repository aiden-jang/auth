import type { ReactNode } from 'react';

export const inputClass =
  'w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const buttonClass =
  'btn-gradient w-full rounded-full px-5 py-3 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

function BrandMark(): ReactNode {
  return (
    <span
      aria-hidden
      className="inline-grid h-8 w-8 place-items-center rounded-[10px]"
      style={{ background: 'linear-gradient(135deg, #a78bfa, #22d3ee)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 3.5h12v17l-2.2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 20.5v-17Z" fill="#09090f" fillOpacity="0.92" />
        <path d="M9 8.5h6M9 12h6M9 15.5h3.5" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
        <BrandMark /> aidenjang
      </div>
      <div className="surface rounded-3xl border border-line bg-card p-6 sm:p-7">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}
