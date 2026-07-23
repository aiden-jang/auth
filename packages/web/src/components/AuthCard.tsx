import type { ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';

export const inputClass =
  'w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const buttonClass =
  'btn-gradient w-full cursor-pointer rounded-full px-5 py-3 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

export const labelClass = 'mb-1.5 block text-sm font-medium text-muted';

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

function Wordmark(): ReactNode {
  // Links home — accounts.aidenjang.com in prod, the local root in dev.
  return (
    <a
      href="/"
      className="inline-flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-80"
    >
      <BrandMark /> aidenjang
    </a>
  );
}

// Credit line linking to the personal site, matching the bloomnote footer.
function MadeBy({ className }: { className?: string }): ReactNode {
  return (
    <p className={className}>
      made by{' '}
      <a
        href="https://www.aidenjang.com"
        target="_blank"
        rel="noreferrer"
        className="hover:text-accent hover:underline"
      >
        aiden jang
      </a>
    </p>
  );
}

// Branded panel shown on the left half at md+. Aurora background, a tagline,
// and a showcase of the apps this login unlocks. Hidden on small screens,
// where a compact wordmark sits above the form instead.
function BrandPanel({ showApps }: { showApps: boolean }): ReactNode {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-canvas p-10 md:flex md:flex-col md:justify-between">
      <div className="aurora" aria-hidden />
      <div className="relative z-10">
        <Wordmark />
      </div>

      <div className="relative z-10">
        <h2 className="max-w-sm text-3xl font-medium leading-tight tracking-tight">
          one login for everything I build.
        </h2>
        {showApps && (
          <ul className="mt-8 space-y-3.5">
            {APPS.map((app) => (
              <li key={app.name}>
                {/* Opens in a new tab so exploring an app never abandons a sign-in in progress
                    (e.g. when the user was sent here with a return_to). */}
                <a
                  href={appHref(app)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-baseline gap-3"
                >
                  <span
                    aria-hidden
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: app.accent }}
                  />
                  <span>
                    <span className="text-sm font-medium text-ink transition-colors group-hover:text-accent">
                      {app.name}
                    </span>
                    <span className="ml-2 text-sm text-muted">{app.tagline}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MadeBy className="relative z-10 text-xs text-muted" />
    </aside>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  showApps = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Whether the branded panel lists the apps. Off for the account hub,
   *  which shows its own interactive launcher. */
  showApps?: boolean;
}): ReactNode {
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <BrandPanel showApps={showApps} />

      <section className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="animate-enter mx-auto w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Wordmark />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>

          {/* The brand panel (which carries the credit) is hidden below md,
              so surface the credit under the form on mobile. */}
          <MadeBy className="mt-8 text-center text-xs text-muted md:hidden" />
        </div>
      </section>
    </main>
  );
}
