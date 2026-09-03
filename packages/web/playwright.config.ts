import { defineConfig, devices } from '@playwright/test';

/**
 * The journey a person actually takes: register, confirm the emailed link, sign out, sign back in.
 *
 * The 279 tests under it know every route answers correctly. None of them know whether somebody
 * can get from an empty form to a signed-in account page in a browser, which is where the bugs
 * that reach people live.
 *
 * The worker's output is teed to a file because that is the only place a verification token
 * exists: the emailed link carries the raw token and the database stores only its hash, so
 * without the log there is no way to follow the link a real person would click. In dev, with no
 * RESEND_API_KEY, the mail is written to stdout instead of sent.
 */
export const WORKER_LOG = '/tmp/aidenjang-auth-e2e-worker.log';

/*
 * A fresh client address per run.
 *
 * Rate limits are keyed on cf-connecting-ip, which local dev never sets, so every request in every
 * run lands in one bucket and the tenth registration within the hour is refused. Naming an address
 * gives each run its own bucket without wiping the local database somebody may be using.
 *
 * Only meaningful here: in production Cloudflare sets this header itself and a caller cannot
 * choose their own bucket.
 */
const RUN_IP = `203.0.113.${(Math.floor(Date.now() / 1000) % 250) + 1}`;

/* Browser tests get a finer-grained address per test from e2e/fixtures.ts; this one covers the
   API-only specs, which use the `request` fixture and never open a context. */

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Serial, sharing one worker and one local D1. This suite is about one person's path through
  // the app, not throughput.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:34110',
    extraHTTPHeaders: { 'cf-connecting-ip': RUN_IP },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      /*
       * Migrations first: the local D1 persists between runs and a fresh checkout has none, so
       * without this the first write fails on a column that does not exist yet.
       *
       * TURNSTILE_SECRET and RESEND_API_KEY are blanked because .dev.vars carries real ones on a
       * developer's machine. Empty means the worker skips the challenge and prints the mail
       * instead of sending it -- which is also the only way this suite can read a token.
       */
      command:
        `pnpm --filter @aidenjang/auth-api db:migrate:local && ` +
        `pnpm --filter @aidenjang/auth-api exec wrangler dev ` +
        `--var APP_URL:http://localhost:34110 --var TURNSTILE_SECRET: --var RESEND_API_KEY: ` +
        `> ${WORKER_LOG} 2>&1`,
      url: 'http://localhost:34100/health',
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: '../..',
    },
    {
      // --mode e2e turns Turnstile off; see packages/web/.env.e2e.
      // exec, not `dev -- --mode e2e`: pnpm swallows the flag and vite silently runs in
      // development mode, which puts the challenge back and leaves every submit disabled.
      command: 'pnpm --filter @aidenjang/auth-web exec vite --mode e2e',
      url: 'http://localhost:34110',
      // Never reused either. A vite server already running from `pnpm dev` was started without
      // --mode e2e, so reusing it silently puts the challenge back and every form stays disabled.
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: '../..',
    },
  ],
});
