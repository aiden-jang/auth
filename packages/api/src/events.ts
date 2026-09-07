import type { Env } from './env.js';

// One dataset across every app: index1/blob1 app, blob2 event, blob3 variant, blob4 detail.
// Moving a position here silently breaks every other app's queries.
const APP = 'auth';

export function writeEvent(env: Env, name: string, variant = '', detail = ''): void {
  if (!env.EVENTS) return;
  env.EVENTS.writeDataPoint({
    indexes: [APP],
    blobs: [APP, name, variant.slice(0, 64), detail.slice(0, 64)],
    doubles: [1, 0],
  });
}
