import type { ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';

export function AppLauncher(): ReactNode {
  return (
    <section aria-labelledby="app-launcher-heading">
      <h2
        id="app-launcher-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        Jump into an app
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {APPS.map((app) => (
          <li key={app.name}>
            <a
              href={appHref(app)}
              className="group flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-field px-3 py-3 transition hover:border-accent sm:px-4"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: app.accent }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-ink">
                    {app.name}
                  </span>
                  <span className="mt-1 hidden text-xs text-muted sm:block">{app.tagline}</span>
                </span>
              </span>
              <span
                aria-hidden
                className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
              >
                &rarr;
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
