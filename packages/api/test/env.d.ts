// Types the bindings `cloudflare:test` hands tests: the app's own Env, plus the migrations the
// vitest config passes through so the setup file can apply them.
import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { Env } from '../src/env.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

/*
 * workerd implements getSetCookie -- it is how a test reads several Set-Cookie headers apart,
 * which a comma-joined `get('set-cookie')` cannot do -- but @cloudflare/workers-types does not
 * declare it. Declared here rather than cast at each call site, so the tests stay type-checked.
 */
declare global {
  interface Headers {
    getSetCookie(): string[];
  }
}
