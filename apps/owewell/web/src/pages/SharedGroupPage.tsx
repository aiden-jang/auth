import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Money } from '@aidenjang/shared';
import { categoryMeta, type SharedGroupSummary } from '@owewell/core';
import { useAuth } from '../auth/AuthContext';
import { groupsApi } from '../lib/groups';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { SiteFooter } from '../components/SiteFooter';

function balanceLabel(netCents: number): { text: string; tone: string } {
  if (netCents === 0) return { text: 'settled', tone: 'text-muted' };
  const amount = Money.fromCents(Math.abs(netCents)).format();
  return netCents > 0
    ? { text: `is owed ${amount}`, tone: 'text-pos' }
    : { text: `owes ${amount}`, tone: 'text-neg' };
}

/**
 * Public, read-only view of a group behind a share token. No auth: anyone with the link sees
 * the summary. Editing lives in the app, so the only action here is "sign in to edit", which
 * opens the real group (members-only, enforced server-side).
 */
export function SharedGroupPage(): ReactNode {
  const { token } = useParams<{ token: string }>();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [summary, setSummary] = useState<SharedGroupSummary | null>(null);

  // Open the real (editable) group. Signed-in members go straight there; everyone else is sent
  // through sign-in and returned to the group afterward (editing is members-only server-side).
  function openForEditing(groupId: string): void {
    const dest = `/groups/${groupId}`;
    if (user) navigate(dest);
    else login(`${window.location.origin}${dest}`);
  }

  useEffect(() => {
    if (!token) {
      setStatus('notfound');
      return;
    }
    groupsApi
      .sharedSummary(token)
      .then((s) => {
        setSummary(s);
        setStatus('ready');
      })
      .catch(() => setStatus('notfound'));
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <BrandMark /> owewell
          </Link>
          <span className="text-xs text-muted">shared summary · read-only</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 animate-rise px-4 py-8">
        {status === 'loading' && <p className="text-center text-sm text-muted">Loading the tab...</p>}

        {status === 'notfound' && (
          <div className="rounded-3xl border border-dashed border-line p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface2 text-muted">
              <Icon name="link" size={22} />
            </div>
            <p className="mt-4 text-lg font-medium">This link isn&rsquo;t valid.</p>
            <p className="mt-1 text-sm text-muted">It may have been turned off, or the group is gone.</p>
          </div>
        )}

        {status === 'ready' && summary && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{summary.groupName}</h1>
            <p className="mt-1 text-sm text-muted">
              {summary.memberCount} {summary.memberCount === 1 ? 'person' : 'people'}
            </p>

            <div className="glass mt-5 rounded-3xl p-6 sm:p-7">
              <p className="text-sm font-medium text-muted">Spent together</p>
              <p className="mt-1 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
                {Money.fromCents(summary.totalSpentCents).format()}
              </p>
              <p className="mt-2 text-xs text-faint">
                {Money.fromCents(summary.perPersonCents).format()} each
                {summary.totalSettledCents > 0 &&
                  ` · ${Money.fromCents(summary.totalSettledCents).format()} settled so far`}
              </p>
            </div>

            <section className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft p-4">
              <h2 className="text-sm font-semibold text-accent">Who owes who</h2>
              {summary.suggested.length === 0 ? (
                <p className="mt-2 text-sm text-muted">All settled up. Nobody owes anybody.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {summary.suggested.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{p.fromName}</span>
                        <span className="text-muted"> pays </span>
                        <span className="font-medium">{p.toName}</span>
                      </span>
                      <span className="tnum font-medium">{Money.fromCents(p.amountCents).format()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Members</h2>
              <ul className="mt-3 space-y-2">
                {summary.members.map((m, i) => {
                  const label = balanceLabel(m.netCents);
                  return (
                    <li key={i} className="surface flex items-center justify-between rounded-xl px-4 py-3">
                      <span className="flex items-center gap-3 font-medium">
                        <Avatar name={m.displayName} />
                        {m.displayName}
                      </span>
                      <span className={`tnum text-sm font-medium ${label.tone}`}>{label.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {summary.breakdown.length > 1 && (
              <section className="mt-8">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Where it went</h2>
                <ul className="mt-3 space-y-2.5">
                  {summary.breakdown.map(({ category, cents }) => {
                    const meta = categoryMeta(category);
                    return (
                      <li key={category} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-sm">
                          <span aria-hidden className="mr-1.5">
                            {meta.emoji}
                          </span>
                          {meta.label}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{
                              width: `${Math.max(3, Math.round((cents / summary.totalSpentCents) * 100))}%`,
                            }}
                          />
                        </span>
                        <span className="tnum w-20 shrink-0 text-right text-sm text-muted">
                          {Money.fromCents(cents).format()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <button
              type="button"
              onClick={() => openForEditing(summary.groupId)}
              className="btn-gradient mt-8 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 font-semibold transition active:scale-[0.98]"
            >
              <Icon name="arrow-up-right" size={16} /> {user ? 'Open in owewell' : 'Sign in to edit'}
            </button>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
