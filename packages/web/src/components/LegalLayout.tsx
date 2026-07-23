import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared shell for the legal pages (/privacy, /terms). Wider than AuthCard since these are
 * documents, not forms. One home for both keeps the copy in sync and gives every app a single
 * URL to link at (accounts.aidenjang.com/privacy, /terms).
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
      <Link to="/account" className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
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
        aidenjang
      </Link>

      <div className="surface rounded-3xl border border-line bg-card p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated: {updated}</p>
        <div className="legal-prose mt-6 space-y-6 text-sm leading-relaxed text-ink/90">{children}</div>
      </div>

      <nav className="mt-6 flex justify-center gap-5 text-sm text-muted">
        <Link to="/privacy" className="hover:text-accent hover:underline">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-accent hover:underline">
          Terms
        </Link>
        <Link to="/account" className="hover:text-accent hover:underline">
          Account
        </Link>
      </nav>
    </main>
  );
}

/** A titled section within a legal document. */
export function Section({ heading, children }: { heading: string; children: ReactNode }): ReactNode {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{heading}</h2>
      {children}
    </section>
  );
}
