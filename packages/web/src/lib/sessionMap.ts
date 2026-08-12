/*
 * Country level and no finer. The schema deliberately keeps no IP, and edge geolocation lands in the
 * wrong borough often enough that a city pin would claim an accuracy the data does not have.
 */

/** Approximate centroid of each country, keyed by the ISO-3166 alpha-2 code Cloudflare reports. */
const COUNTRY_POINTS: Record<string, [lat: number, lon: number]> = {
  AE: [23.4, 53.8], AR: [-38.4, -63.6], AT: [47.5, 14.6], AU: [-25.3, 133.8], BD: [23.7, 90.4],
  BE: [50.5, 4.5], BG: [42.7, 25.5], BR: [-14.2, -51.9], CA: [56.1, -106.3], CH: [46.8, 8.2],
  CL: [-35.7, -71.5], CN: [35.9, 104.2], CO: [4.6, -74.3], CZ: [49.8, 15.5], DE: [51.2, 10.5],
  DK: [56.3, 9.5], EE: [58.6, 25.0], EG: [26.8, 30.8], ES: [40.5, -3.7], FI: [61.9, 25.7],
  FR: [46.2, 2.2], GB: [55.4, -3.4], GR: [39.1, 21.8], HK: [22.4, 114.1], HR: [45.1, 15.2],
  HU: [47.2, 19.5], ID: [-0.8, 113.9], IE: [53.4, -8.2], IL: [31.0, 34.9], IN: [20.6, 79.0],
  IS: [65.0, -19.0], IT: [41.9, 12.6], JP: [36.2, 138.3], KE: [-0.0, 37.9], KR: [35.9, 127.8],
  LT: [55.2, 23.9], LU: [49.8, 6.1], LV: [56.9, 24.6], MA: [31.8, -7.1], MX: [23.6, -102.6],
  MY: [4.2, 101.98], NG: [9.1, 8.7], NL: [52.1, 5.3], NO: [60.5, 8.5], NZ: [-40.9, 174.9],
  PE: [-9.2, -75.0], PH: [12.9, 121.8], PK: [30.4, 69.3], PL: [51.9, 19.1], PT: [39.4, -8.2],
  RO: [45.9, 25.0], RS: [44.0, 21.0], RU: [61.5, 105.3], SA: [23.9, 45.1], SE: [60.1, 18.6],
  SG: [1.35, 103.8], SI: [46.2, 15.0], SK: [48.7, 19.7], TH: [15.9, 101.0], TR: [39.0, 35.2],
  TW: [23.7, 121.0], UA: [48.4, 31.2], US: [39.8, -98.6], VN: [14.1, 108.3], ZA: [-30.6, 22.9],
};

/** Equirectangular, in SVG user units. */
export const MAP_WIDTH = 360;
export const MAP_HEIGHT = 180;

export function project(lat: number, lon: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * MAP_WIDTH, y: ((90 - lat) / 180) * MAP_HEIGHT };
}

/** Takes the last comma-separated part, so "Washington, D.C., US" still lands in the US. */
export function countryOf(location: string | null | undefined): string | null {
  if (!location) return null;
  const last = location.split(',').pop()?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(last) ? last : null;
}

export interface SessionLike {
  id: string;
  location: string | null;
  current?: boolean;
}

export interface MapPoint {
  country: string;
  x: number;
  y: number;
  count: number;
  hasCurrent: boolean;
}

export interface MapReading {
  points: MapPoint[];
  /** Not droppable: the map has to admit to sessions it could not place. */
  unplaced: number;
  countries: number;
}

/** One dot per country: four laptops in one country are four dots in one pixel. */
export function mapSessions(sessions: readonly SessionLike[]): MapReading {
  const byCountry = new Map<string, MapPoint>();
  let unplaced = 0;

  for (const session of sessions) {
    const country = countryOf(session.location);
    const point = country ? COUNTRY_POINTS[country] : undefined;
    if (!country || !point) {
      unplaced += 1;
      continue;
    }
    const existing = byCountry.get(country);
    if (existing) {
      existing.count += 1;
      existing.hasCurrent ||= session.current === true;
    } else {
      const { x, y } = project(point[0], point[1]);
      byCountry.set(country, { country, x, y, count: 1, hasCurrent: session.current === true });
    }
  }

  return {
    // Stable render order; Map insertion order follows however the API returned them.
    points: [...byCountry.values()].sort((a, b) => a.country.localeCompare(b.country)),
    unplaced,
    countries: byCountry.size,
  };
}

/** No verdict: the app cannot tell whether Frankfurt is you on holiday or somebody else. */
export function mapSummary(reading: MapReading): string {
  const { countries, unplaced } = reading;
  const placed = reading.points.reduce((sum, point) => sum + point.count, 0);
  if (placed === 0) {
    return unplaced > 0
      ? `No location for ${unplaced === 1 ? 'this session' : 'these sessions'}.`
      : 'Nothing signed in anywhere.';
  }
  const sessions = `${placed} ${placed === 1 ? 'session' : 'sessions'}`;
  const where = countries === 1 ? '1 country' : `${countries} countries`;
  const rest = unplaced > 0 ? `, and ${unplaced} with no location` : '';
  return `${sessions} across ${where}${rest}.`;
}

/** Exported so a test can check the coordinates are all real. */
export const KNOWN_COUNTRIES = Object.keys(COUNTRY_POINTS);
export const COUNTRY_TABLE = COUNTRY_POINTS;
