import { join } from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Runs tests inside the real Workers runtime with the bindings from wrangler.toml
// (local in-memory D1 + the RateLimiter Durable Object). D1 needs a schema, so we
// read the app's migrations at config time and hand them to the test worker; a
// setup file applies them to the isolated test database before each test file.
export default defineWorkersConfig(async () => {
  // Absolute, not './migrations': knip loads this config from the repo root, and a relative
  // path resolves against the caller's directory rather than this one.
  const migrations = await readD1Migrations(join(import.meta.dirname, 'migrations'));
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
              // Neutralize secrets miniflare would otherwise pull from a local .dev.vars, so tests
              // are hermetic regardless of the dev machine: no real Resend calls, Turnstile treated
              // as unconfigured (challenge skipped), and Google OAuth disabled.
              RESEND_API_KEY: '',
              TURNSTILE_SECRET: '',
              GOOGLE_CLIENT_ID: '',
              GOOGLE_CLIENT_SECRET: '',
            },
          },
        },
      },
    },
  };
});
