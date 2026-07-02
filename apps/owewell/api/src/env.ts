/** Bindings + vars declared in wrangler.toml / secrets, surfaced to the Worker. */
export interface Env {
  // owewell's own data (people, groups, expenses, settlements, invites).
  DB: D1Database;
  // Base URL of the shared auth service (e.g. https://accounts.aidenjang.com); the API
  // validates the caller's session against it. Local dev: http://localhost:34100.
  AUTH_URL: string;
}
