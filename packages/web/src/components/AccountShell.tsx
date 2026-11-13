import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MadeBy, Wordmark } from './AccountBrand';

export function AccountShell({
  title,
  subtitle,
  action,
  navigation,
  identity,
  legal = false,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  navigation?: ReactNode;
  identity?: ReactNode;
  legal?: boolean;
  children: ReactNode;
}): ReactNode {
  const intro = (
    <div className="hub-intro">
      <h1 id="account-page-heading" tabIndex={-1}>
        {title}
      </h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
  const links = (
    <nav className="hub-pages" aria-label="Main navigation">
      <NavLink to="/account">Account</NavLink>
      <NavLink to="/privacy">Privacy</NavLink>
      <NavLink to="/terms">Terms</NavLink>
    </nav>
  );
  return (
    <main className={`hub-shell${legal ? ' legal-page' : ''}`}>
      <a href="#account-content" className="auth-skip-link">
        Skip to main content
      </a>
      <header className="hub-masthead">
        <div className="hub-topline">
          <Wordmark />
          {legal ? links : action}
        </div>
        {legal && intro}
      </header>
      {legal ? (
        <div id="account-content" tabIndex={-1} data-focus-fallback="" className="legal-content">
          {children}
        </div>
      ) : (
        <div className={`${navigation ? 'hub-workspace' : 'hub-content'} hub-width`}>
          {navigation && <aside className="hub-sidebar">{navigation}</aside>}
          <div id="account-content" tabIndex={-1} data-focus-fallback="" className="hub-panel">
            {identity}
            {intro}
            {children}
          </div>
        </div>
      )}
      <footer className="hub-footer hub-width">
        <MadeBy />
        {!legal && links}
      </footer>
    </main>
  );
}
