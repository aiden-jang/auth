import type { Env } from './env.js';

// 6 chars of a curated base62 (no 0/O/1/l/I) = ~56 billion ids; collisions are effectively
// impossible for this app's volume, but we still retry on the rare hit. The short code IS the
// primary key — KV stores work this way.
const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 6;
const MAX_COLLISION_RETRIES = 4;
const MAX_GARDEN_BYTES = 16 * 1024; // real gardens are ~2KB; reject anything that would blow the budget

function generateId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return id;
}

/** Cheap structural check: shaped like a garden, and not absurdly large. */
export function looksLikeGarden(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return Array.isArray(g.flowers) && g.flowers.length > 0 && g.flowers.length <= 10;
}

export type CreateResult = { ok: true; id: string } | { ok: false; status: 400 | 413 | 500; message: string };

export async function createGarden(env: Env, garden: unknown): Promise<CreateResult> {
  if (!looksLikeGarden(garden)) return { ok: false, status: 400, message: 'Body does not look like a garden.' };
  const serialized = JSON.stringify(garden);
  if (serialized.length > MAX_GARDEN_BYTES) {
    return { ok: false, status: 413, message: `Garden exceeds ${MAX_GARDEN_BYTES} bytes.` };
  }
  // KV has no atomic SETNX, but at this id space a collision is astronomically unlikely; a
  // get-then-put with a few retries is more than enough. Gardens are immutable once written.
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const id = generateId();
    if ((await env.GARDENS.get(`g:${id}`)) === null) {
      await env.GARDENS.put(`g:${id}`, serialized);
      return { ok: true, id };
    }
  }
  return { ok: false, status: 500, message: 'Could not generate a unique id. Try again.' };
}

/** Read a garden by short id, or null if the id is malformed or unknown. */
export async function readGarden(env: Env, id: string): Promise<unknown | null> {
  if (!/^[A-Za-z0-9]{4,12}$/.test(id)) return null;
  const raw = await env.GARDENS.get(`g:${id}`);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}
