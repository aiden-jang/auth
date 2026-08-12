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

/*
 * A map that puts a session in the wrong hemisphere is worse than no map, because the whole reason to
 * draw one is so a glance can answer "is anything signed in somewhere I have never been". These check
 * the two ways that goes wrong: a coordinate table with a sign error in it, and a location string parsed
 * into the wrong country.
 */

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

  /*
   * Spot checks against the one error a table like this actually gets: a flipped sign.
   *
   * A transposed digit moves a dot a few hundred miles and nobody notices. A missing minus puts the
   * United States in China, and these are the hemispheres worth pinning down.
   */
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
    // The y axis is inverted relative to latitude, which is exactly the sign error worth a test.
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
    // Taking the last part rather than the second means "Washington, D.C., US" still lands in the US.
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
    // Four laptops in one country are four dots in the same place, which reads as one and hides the count.
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
    /*
     * `||=` rather than assignment.
     *
     * Written the obvious way, a later session in the same country overwrites the flag an earlier one
     * set, so "this device" vanishes from the map whenever another laptop in the same country happens to
     * sort after it. Only the current-last order catches an assignment bug, so both are checked.
     */
    const currentLast = mapSessions([session('Brooklyn, US'), session('Austin, US', true)]);
    expect(currentLast.points.find((p) => p.country === 'US')?.hasCurrent).toBe(true);

    const currentFirst = mapSessions([session('Brooklyn, US', true), session('Austin, US')]);
    expect(currentFirst.points.find((p) => p.country === 'US')?.hasCurrent).toBe(true);
  });

  it('counts what it cannot place instead of silently dropping it', () => {
    /*
     * The honesty requirement.
     *
     * A session the table has no coordinates for still exists and is still signed in. Dropping it makes
     * the map say "two sessions, both here" about an account with three, on the page whose entire job is
     * telling you what is signed in.
     */
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

  /*
   * No verdict, on purpose.
   *
   * This sits on a security page, and the app cannot tell whether a session in Frankfurt is you on
   * holiday or somebody else. Anything reassuring here is a guess presented as a finding.
   */
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
