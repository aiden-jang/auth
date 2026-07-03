import { describe, expect, test } from 'vitest';
import { claimGardens, createGarden, listMine, readGarden, recordReceived } from '../src/gardens.js';
import { testEnv } from './helpers.js';

const GARDEN = {
  flowers: [{ name: 'Rose', petalColors: ['#e11d48'] }],
  message: 'hi',
  from: 'Aria',
  to: 'Bo',
  occasion: 'birthday',
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('gardens (KV)', () => {
  test('create + read round-trip', async () => {
    const r = await createGarden(testEnv, GARDEN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = (await readGarden(testEnv, r.id)) as { message?: string } | null;
    expect(g?.message).toBe('hi');
  });

  test('rejects non-gardens and unknown ids', async () => {
    expect((await createGarden(testEnv, { nope: 1 })).ok).toBe(false);
    expect(await readGarden(testEnv, 'zzzzzz')).toBeNull();
  });

  test('signed-in create indexes the Sent list', async () => {
    const r = await createGarden(testEnv, GARDEN, 'user1');
    if (!r.ok) throw new Error('create failed');
    const mine = await listMine(testEnv, 'user1');
    expect(mine.sent.map((s) => s.id)).toContain(r.id);
    expect(mine.sent[0]?.to).toBe('Bo');
    expect(mine.received).toHaveLength(0);
  });

  test('receive adds to Received for others but not the owner', async () => {
    const r = await createGarden(testEnv, GARDEN, 'owner');
    if (!r.ok) throw new Error('create failed');
    await recordReceived(testEnv, 'owner', r.id); // your own garden isn't "received"
    await recordReceived(testEnv, 'bob', r.id);
    expect((await listMine(testEnv, 'owner')).received).toHaveLength(0);
    const bob = await listMine(testEnv, 'bob');
    expect(bob.received.map((x) => x.id)).toContain(r.id);
    expect(bob.received[0]?.receivedAt).toBeTruthy();
  });

  test('claim adopts anonymous gardens once', async () => {
    const r = await createGarden(testEnv, GARDEN); // anonymous — no owner
    if (!r.ok) throw new Error('create failed');
    expect(await claimGardens(testEnv, 'u', [r.id])).toBe(1);
    expect((await listMine(testEnv, 'u')).sent.map((s) => s.id)).toContain(r.id);
    // Already owned → a second claim by anyone is a no-op.
    expect(await claimGardens(testEnv, 'other', [r.id])).toBe(0);
  });
});
