import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MadeBy, Wordmark } from './AccountBrand';

export function AccountShell({
  title,
  subtitle,
  action,
  legal = false,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  legal?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <main className={`hub-shell${legal ? ' legal-page' : ''}`}>
      <a href="#account-content" className="auth-skip-link">
        Skip to main content
      </a>
      <header className="hub-masthead">
        <div className="hub-width">
          <div className="hub-topline">
            <Wordmark />
            <nav className="hub-pages" aria-label="Main navigation">
              <NavLink to="/account">Account</NavLink>
              <NavLink to="/privacy">Privacy</NavLink>
              <NavLink to="/terms">Terms</NavLink>
            </nav>
          </div>
          <div className="hub-intro">
            <div>
              <h1 tabIndex={-1}>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {action}
          </div>
        </div>
      </header>
      <div
        id="account-content"
        tabIndex={-1}
        data-focus-fallback=""
        className={legal ? 'legal-content' : 'hub-content hub-width'}
      >
        {children}
      </div>
      <footer className="hub-footer hub-width">
        <MadeBy />
      </footer>
    </main>
  );
}
