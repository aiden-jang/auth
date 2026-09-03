import { type FormEvent, type ReactNode } from 'react';
import type { Sessions } from '../lib/useSessions';
import { reassurance } from '../lib/reassurance';
import { sessionHorizon } from '../lib/sessionHorizon';
import { inputClass } from './AuthCard';
import { Skeleton } from './Skeleton';

/*
 * The "signed in on these devices" list: renaming, signing one out, signing the rest out.
 *
 * The state lives in useSessions rather than here, because the security-review banner on the
 * account page acts on the same devices. This component only renders them.
 *
 * Destructured back into the names the markup already used, so the JSX below is the same markup it
 * was inside the page -- the move is a move, not a rewrite.
 */
export function SessionList({
  sessions: store,
  mountedAt,
  timeAgo,
  exactTime,
}: {
  sessions: Sessions;
  /** Stamped once by the page, so "added in the last day" does not change mid-render. */
  mountedAt: number;
  timeAgo: (iso: string) => string;
  exactTime: (iso: string) => string;
}): ReactNode {
  const {
    list: sessions,
    error: sessionError,
    refreshing: refreshingSessions,
    justRefreshed: sessionsRefreshed,
    revokingId,
    revokingOthers,
    expandedId: expandedSessionId,
    renamingId: renamingSessionId,
    nameDraft: sessionNameDraft,
    savingName: savingSessionName,
    setExpandedId: setExpandedSessionId,
    setNameDraft: setSessionNameDraft,
    revoke,
    revokeOthers,
    beginRename: beginSessionRename,
    rename,
  } = store;
  const cancelRename = store.cancelRename;
  const refreshSessions = store.refresh;
  const renameSession = (event: FormEvent, id: string): Promise<void> => rename(event, id);

  return (
    <section id="active-sessions" aria-label="Active sessions" className="scroll-mt-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Active sessions</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshSessions(true)}
            disabled={refreshingSessions}
            className="text-xs font-medium text-muted hover:text-accent hover:underline disabled:cursor-default disabled:opacity-60"
          >
            {refreshingSessions ? 'Refreshing…' : sessionsRefreshed ? 'Up to date' : 'Refresh'}
          </button>
          {sessions && sessions.length > 1 && (
            <button
              type="button"
              onClick={() => void revokeOthers()}
              disabled={revokingOthers}
              className="cursor-pointer text-xs font-medium text-accent hover:underline disabled:opacity-60"
            >
              {revokingOthers ? 'Signing out...' : 'Sign out everywhere else'}
            </button>
          )}
        </div>
      </div>
      {(sessions === null || refreshingSessions) && (
        <p role="status" className="mt-3 text-xs text-muted">
          {reassurance('sessions')}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {sessions === null ? (
          <>
            <li>
              <Skeleton className="h-14 w-full" />
            </li>
            <li>
              <Skeleton className="h-14 w-full" />
            </li>
          </>
        ) : sessions.length === 0 ? (
          <li className="text-sm text-muted">No active sessions.</li>
        ) : (
          sessions.map((s) => {
            const expanded = expandedSessionId === s.id;
            const horizon = sessionHorizon(s.createdAt, s.expiresAt);
            const recentlyAdded =
              !s.current && mountedAt - new Date(s.createdAt).getTime() < 24 * 60 * 60 * 1000;
            return (
              <li key={s.id} className="rounded-xl border border-line bg-field px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setExpandedSessionId(expanded ? null : s.id)}
                    aria-expanded={expanded}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {s.device ?? 'Unknown device'}
                      </span>
                      {s.current && (
                        <span className="shrink-0 rounded-full border border-pos/30 bg-pos/10 px-2 py-0.5 text-xs font-medium text-pos">
                          this device
                        </span>
                      )}
                      {recentlyAdded && (
                        <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          new
                        </span>
                      )}
                      {horizon.tone === 'soon' && (
                        <span className="shrink-0 rounded-full border border-neg/25 bg-neg/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neg">
                          expires soon
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {[s.location, timeAgo(s.lastSeenAt)].filter(Boolean).join(' · ')} ·{' '}
                      {expanded ? 'hide details' : 'details'}
                    </span>
                  </button>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => void revoke(s.id)}
                      disabled={revokingId === s.id}
                      className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-60"
                    >
                      {revokingId === s.id ? '...' : 'Sign out'}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="mt-3 border-t border-line pt-3">
                    <dl className="grid gap-2 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">First signed in</dt>
                        <dd className="mt-0.5 font-medium text-ink">{exactTime(s.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Last active</dt>
                        <dd className="mt-0.5 font-medium text-ink">{exactTime(s.lastSeenAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Approximate location</dt>
                        <dd className="mt-0.5 font-medium text-ink">
                          {s.location ?? 'Not available'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Session lifetime</dt>
                        <dd
                          className={`mt-0.5 font-medium ${
                            horizon.tone === 'soon' ? 'text-neg' : 'text-ink'
                          }`}
                        >
                          {horizon.label}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted">
                        <span>session time remaining</span>
                        <span className="tnum">{horizon.percentRemaining}%</span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-line"
                        role="progressbar"
                        aria-label={`${s.device ?? 'This session'} lifetime remaining`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={horizon.percentRemaining}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] ${
                            horizon.tone === 'soon' ? 'bg-neg' : 'bg-accent'
                          }`}
                          style={{ width: `${horizon.percentRemaining}%` }}
                        />
                      </div>
                    </div>
                    {renamingSessionId === s.id ? (
                      <form
                        onSubmit={(event) => void renameSession(event, s.id)}
                        className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-canvas/50 p-3 sm:flex-row sm:items-end"
                      >
                        <label className="min-w-0 flex-1 text-xs font-medium text-muted">
                          Device name
                          <input
                            autoFocus
                            maxLength={40}
                            value={sessionNameDraft}
                            onChange={(event) => setSessionNameDraft(event.target.value)}
                            placeholder="Personal MacBook"
                            className={`${inputClass} mt-1 py-2`}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              cancelRename();
                              setSessionNameDraft('');
                            }}
                            className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted hover:text-ink"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={savingSessionName || !sessionNameDraft.trim()}
                            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {savingSessionName ? 'Saving…' : 'Save name'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginSessionRename(s)}
                        className="mt-3 text-xs font-medium text-accent hover:underline"
                      >
                        Rename device
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
      {sessionError && (
        <p role="alert" className="mt-3 text-sm font-medium text-neg">
          {sessionError}
        </p>
      )}
    </section>
  );
}
