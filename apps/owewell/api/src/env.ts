/** Bindings + vars declared in wrangler.toml / secrets, surfaced to the Worker. */
export interface Env {
  // owewell's own data (people, groups, expenses, settlements, invites).
  DB: D1Database;
}
