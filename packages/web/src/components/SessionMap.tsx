import type { ReactNode } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, mapSessions, mapSummary, type SessionLike } from '../lib/sessionMap';

/*
 * A graticule, not a coastline: a world silhouette small enough to inline is one wrong enough to
 * notice, and a map that misplaces Denmark undermines the dots on top of it.
 */

/** Every 30 degrees. */
const GRATICULE_LONS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GRATICULE_LATS = [-60, -30, 0, 30, 60];

function radiusFor(count: number): number {
  // Grows slowly, or one busy country swallows a continent.
  return 3 + Math.min(3, Math.sqrt(count - 1) * 1.6);
}

export function SessionMap({ sessions }: { sessions: readonly SessionLike[] }): ReactNode {
  const reading = mapSessions(sessions);
  const summary = mapSummary(reading);

  // An empty grid reads as a broken component.
  if (reading.points.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-field px-4 py-3 text-xs text-muted">{summary}</p>
    );
  }

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl border border-line bg-field">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="block w-full"
          role="img"
          aria-label={`Approximate session locations. ${summary}`}
        >
          <g stroke="currentColor" className="text-line" strokeWidth="0.4" opacity="0.7">
            {GRATICULE_LONS.map((lon) => {
              const x = ((lon + 180) / 360) * MAP_WIDTH;
              return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={MAP_HEIGHT} />;
            })}
            {GRATICULE_LATS.map((lat) => {
              const y = ((90 - lat) / 180) * MAP_HEIGHT;
              // One stronger line to orient from.
              return (
                <line
                  key={`lat${lat}`}
                  x1={0}
                  y1={y}
                  x2={MAP_WIDTH}
                  y2={y}
                  strokeWidth={lat === 0 ? 0.8 : 0.4}
                />
              );
            })}
          </g>

          {reading.points.map((point, index) => (
            <g
              key={point.country}
              className="session-dot"
              // Capped, or a busy account spends two seconds assembling itself.
              style={{ animationDelay: `${Math.min(index * 70, 560)}ms` }}
            >
              {point.hasCurrent && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radiusFor(point.count)}
                  className="session-dot-pulse text-pos"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={radiusFor(point.count)}
                className={point.hasCurrent ? 'text-pos' : 'text-accent'}
                fill="currentColor"
                fillOpacity={0.85}
              />
              <text
                x={point.x}
                y={point.y - radiusFor(point.count) - 2.5}
                textAnchor="middle"
                className="fill-muted"
                style={{ fontSize: 7, fontWeight: 600 }}
              >
                {point.country}
                {point.count > 1 ? ` ×${point.count}` : ''}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{summary}</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-pos" />
          this device
        </span>
        <span>Country level only, from the edge. No precise location is collected.</span>
      </figcaption>
    </figure>
  );
}
