import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Runs tests inside the real Workers runtime with the bindings from wrangler.toml
// (local in-memory D1 + the RateLimiter Durable Object). D1 needs a schema, so we
// read the app's migrations at config time and hand them to the test worker; a
// setup file applies them to the isolated test database before each test file.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              // Handed to the setup file via env; not a real app binding.
              TEST_MIGRATIONS: migrations,
              // Force the no-op email path so tests never make real Resend
              // calls, even if a local .dev.vars has a live key.
              RESEND_API_KEY: '',
            },
          },
        },
      },
    },
  };
});
