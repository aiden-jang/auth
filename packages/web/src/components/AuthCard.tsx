import type { CSSProperties, ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';
import type { ReturnApp } from '../lib/returnTo';
import { themeFor, themeStyle } from '../lib/theme';
import { AccountArt } from './AccountArt';
import { MadeBy, Wordmark } from './AccountBrand';

export const inputClass =
  'w-full rounded-[10px] border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const buttonClass =
  'btn-primary w-full cursor-pointer rounded-[10px] px-5 py-3 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

export const labelClass = 'mb-1.5 block text-sm font-medium text-muted';

function BrandPanel(): ReactNode {
  return (
    <aside className="brand-panel">
      <Wordmark accounts />
      <div className="brand-panel-story">
        <h2>
          One account.
          <br />
          Fewer keys.
        </h2>
        <p className="brand-panel-caption">The keyring was getting ridiculous.</p>
      </div>
      <nav className="brand-panel-apps" aria-label="Apps">
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
                <span translate="no">{app.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p className="brand-panel-footnote">Quite a few doors, actually.</p>
    </aside>
  );
}

const brandPanel = <BrandPanel />;

export function AuthCard({
  title,
  subtitle,
  returnApp,
  artwork,
  header,
  children,
}: {
  title: string;
  subtitle?: string;
  /** The verified app a sign-in will return to, when there is one. */
  returnApp?: ReturnApp | null;
  artwork?: 'mail';
  header?: ReactNode;
  children: ReactNode;
}): ReactNode {
  /*
   * Scoped to this element, not the document root, so the theme cannot outlive the page that asked
   * for it -- signing in from bloomnote must not leave the hub pink. Safe to colour from at all
   * only because returnAppFor has already whitelist-validated it.
   */
  const theme = themeFor(returnApp ?? null);

  return (
    <div className="auth-shell" style={themeStyle(theme)}>
      <a href="#auth-content" className="auth-skip-link">
        Skip to main content
      </a>
      {brandPanel}

      <div className="auth-form-panel">
        <header className="auth-form-header">
          <div className="auth-mobile-wordmark">
            <Wordmark accounts />
          </div>
          {header && <div className="auth-header-action">{header}</div>}
        </header>
        <main id="auth-content" tabIndex={-1} className="auth-form-body animate-enter">
          {artwork && <AccountArt kind={artwork} />}
          <h1 tabIndex={-1} className="auth-title">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-sm text-muted">{subtitle}</p>}
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
          <div className="mt-7">{children}</div>
        </main>
        <footer className="auth-footer">
          <MadeBy />
          <nav aria-label="Legal" className="flex gap-5">
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
        </footer>
      </div>
    </div>
  );
}
