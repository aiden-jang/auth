/** Bindings declared in wrangler.toml, surfaced to the Worker. */
export interface Env {
  // Identity store: users + sessions.
  DB: D1Database;
}
