import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Tests cannot inherit live email, bot-challenge, or OAuth secrets from .dev.vars.
            RESEND_API_KEY: '',
            APP_URL: 'http://localhost:34110',
            TURNSTILE_SECRET: '',
            GOOGLE_CLIENT_ID: '',
            GOOGLE_CLIENT_SECRET: '',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'], fileParallelism: false },
  };
});
