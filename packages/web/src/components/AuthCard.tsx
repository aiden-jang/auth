import type { ReactNode } from 'react';
import type { ReturnApp } from '../lib/returnTo';
import { themeFor, themeStyle } from '../lib/theme';
import { AccountArt } from './AccountArt';
import { AppMark } from './AppMark';
import { MadeBy, Wordmark } from './AccountBrand';

export const inputClass =
  'w-full rounded-[9px] border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';
export const buttonClass =
  'btn-primary w-full cursor-pointer rounded-[9px] px-5 py-3 font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink';

export function AuthCard({
  title,
  subtitle,
  returnApp,
  artwork,
  header,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  returnApp?: ReturnApp | null;
  artwork?: 'mail';
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="auth-shell">
      <a href="#auth-content" className="auth-skip-link">
        Skip to main content
      </a>
      <header className="auth-form-header">
        <Wordmark />
        {header && <div className="auth-header-action">{header}</div>}
      </header>
      <main id="auth-content" tabIndex={-1} className="auth-form-body animate-enter">
        <div className="auth-intro">
          {returnApp && (
            <div className="auth-destination" style={themeStyle(themeFor(returnApp))}>
              <AppMark name={returnApp.name} />
              <span translate="no">{returnApp.name}</span>
            </div>
          )}
          {artwork && <AccountArt kind={artwork} />}
          <h1 tabIndex={-1} className="auth-title">
            {title}
          </h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        <div className="auth-sheet">{children}</div>
        {footer && <div className="auth-switch">{footer}</div>}
      </main>
      <footer className="auth-footer">
        <MadeBy />
        <nav aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
