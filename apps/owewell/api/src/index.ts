import type { Env } from './env.js';

// The full Hono API (groups, expenses, settlements, invites, realtime) arrives in the next
// steps. This stub is a valid Worker entry so the D1/migration tooling has something to load.
export default {
  fetch(_request: Request, _env: Env): Response {
    return new Response('owewell api', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
