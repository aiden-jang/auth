import type { ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';
import { AccountIcon } from './AccountIcon';
import { AppMark } from './AppMark';

export function AppLauncher(): ReactNode {
  return (
    <section id="account-apps" className="hub-section" aria-label="Apps">
      <ul className="hub-app-grid">
        {APPS.map((app) => (
          <li key={app.name}>
            <a href={appHref(app)} className="hub-app-link">
              <span className="flex min-w-0 items-center gap-2.5">
                <AppMark name={app.name} />
                <span className="min-w-0">
                  <span translate="no" className="block text-sm font-medium leading-snug text-ink">
                    {app.name}
                  </span>
                  <span className="hub-app-tagline">{app.tagline}</span>
                </span>
              </span>
              <AccountIcon kind="arrow" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
