import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { createSession } from '../src/auth/session.js';
import { hashToken } from '../src/auth/token.js';
import { createDb } from '../src/db/client.js';
import { sessions, users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

it('lists every active device in order while excluding a large expired history and other accounts', async () => {
  const db = createDb(env as unknown as Env);
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  await db.insert(users).values(
    [owner, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      displayName: 'History check',
      emailVerified: true,
    })),
  );
  const { token } = await createSession(db, owner, { device: 'This device' });
  const older = await createSession(db, owner, { device: 'Another device' });
  await createSession(db, other, { device: 'Private device' });
  const expired = Array.from({ length: 500 }, () => ({
    id: crypto.randomUUID(),
    userId: owner,
    expiresAt: new Date(Date.now() - 60_000),
    device: 'Expired device',
  }));
  for (let i = 0; i < expired.length; i += 10)
    await db.insert(sessions).values(expired.slice(i, i + 10));
  const plan = await env.DB.prepare(
    'EXPLAIN QUERY PLAN SELECT id, device FROM sessions WHERE user_id = ? AND expires_at > ?',
  )
    .bind(owner, Math.floor(Date.now() / 1000))
    .all<{ detail: string }>();
  expect(plan.results.map((row) => row.detail).join(' ')).toMatch(
    /SEARCH sessions.*user_id=\?.*expires_at>\?/,
  );
  const response = await SELF.fetch('https://auth.test/auth/sessions', {
    headers: { cookie: `platform_session=${token}` },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    sessions: { id: string; current: boolean; device: string }[];
  };
  expect(body.sessions.map(({ id, current, device }) => ({ id, current, device }))).toEqual([
    { id: await hashToken(token), current: true, device: 'This device' },
    { id: await hashToken(older.token), current: false, device: 'Another device' },
  ]);
});
