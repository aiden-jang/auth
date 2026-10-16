import type { CSSProperties, ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';
import type { ReturnApp } from '../lib/returnTo';
import { themeFor, themeStyle } from '../lib/theme';
import { BrandMark } from './BrandMark';

export const inputClass =
  'w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const buttonClass =
  'btn-primary w-full cursor-pointer rounded-xl px-5 py-3 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

export const labelClass = 'mb-1.5 block text-sm font-medium text-muted';

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
        aria-describedby="external-link-hint"
        rel="noreferrer"
        className="hover:text-accent hover:underline"
      >
        aiden jang
      </a>
    </p>
  );
}

function BrandPanel(): ReactNode {
  return (
    <aside className="brand-panel">
      <Wordmark />
      <div className="brand-panel-story">
        <p className="account-eyebrow">AIDENJANG / ACCOUNTS</p>
        <h2>
          One account.
          <br />
          Fewer keys.
        </h2>
        <p className="brand-panel-caption">The keyring was getting ridiculous.</p>
        <div className="account-key-card" aria-hidden="true">
          <span>ONE ACCOUNT / MANY DOORS</span>
          <svg viewBox="0 0 320 160" fill="none">
            <rect
              x="166"
              y="14"
              width="96"
              height="124"
              rx="18"
              fill="#bccbdd"
              transform="rotate(9 166 14)"
            />
            <rect
              x="164"
              y="25"
              width="96"
              height="124"
              rx="18"
              fill="#aacbfa"
              transform="rotate(-8 164 25)"
            />
            <path
              d="M186 69h30m-30 12h23m-23 12h16"
              stroke="#667f9f"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <g
              transform="rotate(-24 105 80)"
              stroke="#2d3c53"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="97" cy="48" r="30" fill="#e5ebf4" />
              <circle cx="97" cy="36" r="7" />
              <path d="M86 52h6m11 0h6m-14 8h4" />
              <path d="M97 79v58h16v-13h12v-15h-15" fill="#e5ebf4" />
            </g>
          </svg>
          <small>Quite a few doors, actually.</small>
        </div>
      </div>
      <div className="brand-panel-apps">
        <p className="account-eyebrow">THE APPS</p>
        <ul>
          {APPS.map((app) => (
            <li key={app.name}>
              <a
                href={appHref(app)}
                target="_blank"
                aria-describedby="external-link-hint"
                rel="noreferrer"
                style={{ '--app-accent': app.accent } as CSSProperties}
              >
                <span className="app-dot" aria-hidden="true" />
                <span>
                  <strong>{app.name}</strong>
                  <small>{app.tagline}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <MadeBy className="text-xs text-muted" />
    </aside>
  );
}

/**
 * Single column, for the signed-in hub. The split shell sells the platform while you sign in;
 * afterwards there is nothing left to sell. Its brand panel is also `hidden md:flex`, so anything
 * moved into it vanishes on a phone.
 */
export function AccountShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className="account-shell min-h-screen px-5 py-12 sm:px-10">
      <div className="animate-enter mx-auto w-full max-w-xl">
        <Wordmark />
        <p className="account-eyebrow mt-10">ACCOUNT / SETTINGS</p>
        <h1 className="account-title mt-3">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="account-content mt-8">{children}</div>
        <MadeBy className="mt-10 text-center text-xs text-muted" />
      </div>
    </main>
  );
}

export function AuthCard({
  title,
  subtitle,
  returnApp,
  children,
}: {
  title: string;
  subtitle?: string;
  /** The verified app a sign-in will return to, when there is one. */
  returnApp?: ReturnApp | null;
  children: ReactNode;
}): ReactNode {
  /*
   * Scoped to this element, not the document root, so the theme cannot outlive the page that asked
   * for it -- signing in from bloomnote must not leave the hub pink. Safe to colour from at all
   * only because returnAppFor has already whitelist-validated it.
   */
  const theme = themeFor(returnApp ?? null);

  return (
    <main className="auth-shell" style={themeStyle(theme)}>
      <BrandPanel />

      <section className="auth-form-panel">
        <div className="animate-enter mx-auto w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Wordmark />
          </div>
          <p className="account-eyebrow mb-4">YOUR ACCOUNT</p>
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          {returnApp && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: returnApp.accent }}
              />
              You’re heading back to {returnApp.name} <span aria-hidden="true">↗</span>
            </p>
          )}
          <div className="mt-6">{children}</div>

          <nav
            aria-label="Legal"
            className="mt-6 flex justify-center gap-6 border-t border-line pt-3 text-xs text-muted"
          >
            <a
              href="/privacy"
              className="inline-flex min-h-11 items-center hover:text-accent hover:underline"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="inline-flex min-h-11 items-center hover:text-accent hover:underline"
            >
              Terms
            </a>
          </nav>

          {/* The brand panel (which carries the credit) is hidden below md,
              so surface the credit under the form on mobile. */}
          <MadeBy className="mt-8 text-center text-xs text-muted md:hidden" />
        </div>
      </section>
    </main>
  );
}
