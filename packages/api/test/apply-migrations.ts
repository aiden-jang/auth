import { applyD1Migrations, env, listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// The maintained plugin shares storage; reset both account rows and rate-limit counters per test.
beforeEach(async () => {
  await env.DB.exec('DELETE FROM users');
  for (const id of await listDurableObjectIds(env.RATE_LIMITER)) {
    await runInDurableObject(env.RATE_LIMITER.get(id), async (_instance, state) => {
      await state.storage.deleteAll();
    });
  }
});
