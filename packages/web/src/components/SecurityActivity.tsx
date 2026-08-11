import { useEffect, useState, type ReactNode } from 'react';
import { authApi, type SecurityEvent, type SecurityEventType } from '../lib/api';
import { Skeleton } from './Skeleton';

const eventCopy: Record<SecurityEventType, { icon: string; title: string }> = {
  account_created: { icon: '✦', title: 'Account created' },
  signed_in: { icon: '↗', title: 'Signed in' },
  email_verified: { icon: '✓', title: 'Email verified' },
  password_added: { icon: '+', title: 'Password added' },
  password_changed: { icon: '✓', title: 'Password changed' },
  password_reset: { icon: '↻', title: 'Password reset' },
  google_connected: { icon: '+', title: 'Google connected' },
  google_disconnected: { icon: '−', title: 'Google disconnected' },
  device_signed_out: { icon: '×', title: 'A device was signed out' },
  other_devices_signed_out: { icon: '×', title: 'Other devices signed out' },
};

function eventTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SecurityActivity({ refreshKey }: { refreshKey: number }): ReactNode {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void authApi
      .listSecurityEvents()
      .then(({ events: next }) => {
        if (!cancelled) setEvents(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const visible = expanded ? events : events?.slice(0, 3);

  return (
    <section aria-labelledby="security-activity-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="security-activity-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
            Recent security activity
          </h2>
          <p className="mt-1 text-xs text-muted">Only approximate location and device details are kept.</p>
        </div>
        {events && events.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="shrink-0 text-xs font-medium text-accent hover:underline"
          >
            {expanded ? 'Show less' : `See all ${events.length}`}
          </button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-field">
        {events === null && !failed ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : failed ? (
          <p role="status" className="p-4 text-sm text-muted">Couldn’t load recent activity.</p>
        ) : visible?.length === 0 ? (
          <p className="p-4 text-sm text-muted">No recent security activity yet.</p>
        ) : (
          <ol>
            {visible?.map((event, index) => {
              const copy = eventCopy[event.type] ?? { icon: '·', title: 'Account activity' };
              const context = [event.device, event.location].filter(Boolean).join(' · ');
              return (
                <li key={event.id} className={`flex gap-3 px-4 py-3 ${index ? 'border-t border-line' : ''}`}>
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-xs font-bold text-accent"
                  >
                    {copy.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{copy.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {[eventTime(event.createdAt), context].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
