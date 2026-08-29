import type { CSSProperties, ReactNode } from 'react';
import { APPS, appHref } from '../lib/apps';
import type { ReturnApp } from '../lib/returnTo';
import { themeFor, themeStyle } from '../lib/theme';
import { BrandMark } from './BrandMark';

export const inputClass =
  'w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export const buttonClass =
  'btn-gradient w-full cursor-pointer rounded-full px-5 py-3 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

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
function BrandPanel(): ReactNode {
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
        <ul className="mt-8 space-y-3.5">
            {APPS.map((app) => (
              <li key={app.name}>
                {/* Opens in a new tab so exploring an app never abandons a sign-in in progress
                    (e.g. when the user was sent here with a return_to). */}
                {/* Hovering tints the name in the app's own accent, the colour already sitting in
                    its dot, rather than the house purple every row would otherwise share. */}
                <a
                  href={appHref(app)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-baseline gap-3"
                  style={{ '--app-accent': app.accent } as CSSProperties}
                >
                  <span
                    aria-hidden
                    className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: app.accent }}
                  />
                  <span>
                    <span className="text-sm font-medium text-ink transition-colors group-hover:[color:var(--app-accent)]">
                      {app.name}
                    </span>
                    <span className="ml-2 text-sm text-muted">{app.tagline}</span>
                  </span>
                </a>
              </li>
            ))}
        </ul>
      </div>

      <MadeBy className="relative z-10 text-xs text-muted" />
    </aside>
  );
}

/**
 * Single column, for the signed-in hub.
 *
 * The split shell exists to sell the platform while you sign in: brand on the left, task on the
 * right. Once you are signed in there is nothing left to sell, so the account page was spending
 * half a screen on an aurora panel holding a wordmark and a headline that repeated the subtitle
 * sitting a few inches to its right. Worse, that panel is `hidden md:flex`, so it was never a
 * candidate for the app launcher either — anything moved into it vanishes on a phone.
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
    <main className="min-h-screen px-5 py-12 sm:px-10">
      <div className="animate-enter mx-auto w-full max-w-xl">
        <Wordmark />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
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
   * The page wears the colour of the app it will return you to.
   *
   * Scoped to this element rather than written to the document root, so the theme cannot outlive the page
   * that asked for it: signing in from bloomnote and landing on the account page should not leave the hub
   * pink. `returnApp` is already whitelist-validated by returnAppFor, which is what makes it safe to take
   * a colour from at all.
   */
  const theme = themeFor(returnApp ?? null);

  return (
    <main className="grid min-h-screen md:grid-cols-2" style={themeStyle(theme)}>
      <BrandPanel />

      <section className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="animate-enter mx-auto w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <Wordmark />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          {returnApp && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: returnApp.accent }} />
              You&apos;ll go back to {returnApp.name} after this.
            </p>
          )}
          <div className="mt-6">{children}</div>

          {/* The brand panel (which carries the credit) is hidden below md,
              so surface the credit under the form on mobile. */}
          <MadeBy className="mt-8 text-center text-xs text-muted md:hidden" />
        </div>
      </section>
    </main>
  );
}
