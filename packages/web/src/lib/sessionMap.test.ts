import { describe, expect, it } from 'vitest';
import {
  COUNTRY_TABLE,
  KNOWN_COUNTRIES,
  MAP_HEIGHT,
  MAP_WIDTH,
  countryOf,
  mapSessions,
  mapSummary,
  project,
  type SessionLike,
} from './sessionMap';

/* Two ways this goes wrong: a sign error in the table, and a location string parsed into the wrong
 * country. Both put a session in the wrong hemisphere. */

const session = (location: string | null, current = false): SessionLike => ({
  id: Math.random().toString(36).slice(2),
  location,
  current,
});

describe('the coordinate table', () => {
  it('holds only real coordinates', () => {
    for (const code of KNOWN_COUNTRIES) {
      const [lat, lon] = COUNTRY_TABLE[code]!;
      expect(Number.isFinite(lat) && Number.isFinite(lon), code).toBe(true);
      expect(Math.abs(lat), code).toBeLessThanOrEqual(90);
      expect(Math.abs(lon), code).toBeLessThanOrEqual(180);
    }
  });

  it('uses well-formed country codes', () => {
    for (const code of KNOWN_COUNTRIES) expect(code, code).toMatch(/^[A-Z]{2}$/);
  });

  // A transposed digit moves a dot a few hundred miles; a missing minus puts the US in China.
  it('puts countries in the right hemispheres', () => {
    const inWest = (code: string) => COUNTRY_TABLE[code]![1] < 0;
    const inSouth = (code: string) => COUNTRY_TABLE[code]![0] < 0;
    for (const code of ['US', 'CA', 'BR', 'MX', 'GB', 'AR', 'CL', 'PE', 'CO']) {
      expect(inWest(code), `${code} should be west of Greenwich`).toBe(true);
    }
    for (const code of ['JP', 'CN', 'IN', 'AU', 'DE', 'RU', 'ZA', 'SG']) {
      expect(inWest(code), `${code} should be east of Greenwich`).toBe(false);
    }
    for (const code of ['AU', 'NZ', 'ZA', 'AR', 'CL', 'BR', 'PE']) {
      expect(inSouth(code), `${code} should be south of the equator`).toBe(true);
    }
    for (const code of ['US', 'GB', 'JP', 'DE', 'CA', 'IN', 'CN']) {
      expect(inSouth(code), `${code} should be north of the equator`).toBe(false);
    }
  });
});

describe('the projection', () => {
  it('puts the origin in the middle', () => {
    expect(project(0, 0)).toEqual({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
  });

  it('maps the corners to the corners', () => {
    expect(project(90, -180)).toEqual({ x: 0, y: 0 });
    expect(project(-90, 180)).toEqual({ x: MAP_WIDTH, y: MAP_HEIGHT });
  });

  it('puts north above south and east right of west', () => {
    // The y axis is inverted relative to latitude.
    expect(project(51, 0).y).toBeLessThan(project(-34, 0).y);
    expect(project(0, 139).x).toBeGreaterThan(project(0, -74).x);
  });

  it('keeps every known country inside the box', () => {
    for (const code of KNOWN_COUNTRIES) {
      const { x, y } = project(COUNTRY_TABLE[code]![0], COUNTRY_TABLE[code]![1]);
      expect(x, code).toBeGreaterThanOrEqual(0);
      expect(x, code).toBeLessThanOrEqual(MAP_WIDTH);
      expect(y, code).toBeGreaterThanOrEqual(0);
      expect(y, code).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });
});

describe('reading a stored location', () => {
  it('takes the country out of "City, CC"', () => {
    expect(countryOf('Brooklyn, US')).toBe('US');
  });

  it('handles a bare country, which is what the edge gives when it has no city', () => {
    expect(countryOf('DE')).toBe('DE');
  });

  it('survives a city with a comma in it', () => {
    // Last part, not the second, or "Washington, D.C., US" lands nowhere.
    expect(countryOf('Washington, D.C., US')).toBe('US');
  });

  it('has no country for a session that never had one', () => {
    expect(countryOf(null)).toBeNull();
    expect(countryOf('')).toBeNull();
    expect(countryOf('Somewhere')).toBeNull();
  });

  it('does not mistake a long word for a country code', () => {
    expect(countryOf('Unknown')).toBeNull();
    expect(countryOf('Brooklyn, New York')).toBeNull();
  });
});

describe('placing sessions', () => {
  it('gives one dot per country, not per session', () => {
    // Four laptops in one country are four dots in one pixel.
    const reading = mapSessions([session('Brooklyn, US'), session('Austin, US'), session('Berlin, DE')]);
    expect(reading.points).toHaveLength(2);
    expect(reading.points.find((p) => p.country === 'US')?.count).toBe(2);
    expect(reading.countries).toBe(2);
  });

  it('marks the country you are reading this from', () => {
    const reading = mapSessions([session('Berlin, DE'), session('Brooklyn, US', true)]);
    expect(reading.points.find((p) => p.country === 'US')?.hasCurrent).toBe(true);
    expect(reading.points.find((p) => p.country === 'DE')?.hasCurrent).toBe(false);
  });

  it('keeps the current flag whichever order the sessions arrive in', () => {
    // Only the current-last order catches an assignment bug in place of `||=`, so both are checked.
    const currentLast = mapSessions([session('Brooklyn, US'), session('Austin, US', true)]);
    expect(currentLast.points.find((p) => p.country === 'US')?.hasCurrent).toBe(true);

    const currentFirst = mapSessions([session('Brooklyn, US', true), session('Austin, US')]);
    expect(currentFirst.points.find((p) => p.country === 'US')?.hasCurrent).toBe(true);
  });

  it('counts what it cannot place instead of silently dropping it', () => {
    // Dropping one makes the map say "two sessions" about an account with three.
    const reading = mapSessions([session('Brooklyn, US'), session(null), session('Somewhere, ZZ')]);
    expect(reading.points).toHaveLength(1);
    expect(reading.unplaced).toBe(2);
  });

  it('is stable across refreshes rather than following API order', () => {
    const a = mapSessions([session('Berlin, DE'), session('Tokyo, JP'), session('Brooklyn, US')]);
    const b = mapSessions([session('Brooklyn, US'), session('Berlin, DE'), session('Tokyo, JP')]);
    expect(a.points.map((p) => p.country)).toEqual(b.points.map((p) => p.country));
  });

  it('has nothing to draw for no sessions', () => {
    expect(mapSessions([])).toEqual({ points: [], unplaced: 0, countries: 0 });
  });
});

describe('the summary line', () => {
  it('counts sessions and countries', () => {
    expect(mapSummary(mapSessions([session('Brooklyn, US'), session('Austin, US'), session('Berlin, DE')]))).toBe(
      '3 sessions across 2 countries.',
    );
  });

  it('reads properly for one of each', () => {
    expect(mapSummary(mapSessions([session('Brooklyn, US')]))).toBe('1 session across 1 country.');
  });

  it('admits to the ones it could not place', () => {
    expect(mapSummary(mapSessions([session('Brooklyn, US'), session(null)]))).toBe(
      '1 session across 1 country, and 1 with no location.',
    );
  });

  it('says something true when nothing can be placed at all', () => {
    expect(mapSummary(mapSessions([session(null)]))).toBe('No location for this session.');
    expect(mapSummary(mapSessions([]))).toBe('Nothing signed in anywhere.');
  });

  // The app cannot tell whether Frankfurt is you on holiday, so anything reassuring is a guess.
  it('never tells you whether this is fine', () => {
    const lines = [
      mapSummary(mapSessions([])),
      mapSummary(mapSessions([session('Brooklyn, US', true)])),
      mapSummary(mapSessions([session('Brooklyn, US', true), session('Frankfurt, DE')])),
      mapSummary(mapSessions([session(null)])),
    ];
    for (const line of lines) {
      expect(line, line).not.toMatch(/looks|safe|secure|fine|normal|suspicious|unusual|unrecognis|warning/i);
    }
  });
});
