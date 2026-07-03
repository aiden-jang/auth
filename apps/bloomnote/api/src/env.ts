/** Bindings declared in wrangler.toml / secrets, surfaced to the Worker. */
export interface Env {
  // Garden short-URL store: `g:<shortId>` -> garden JSON.
  GARDENS: KVNamespace;
  // The built web SPA (apps/bloomnote/web/dist), served from this same Worker.
  ASSETS: Fetcher;
  // Gemini key for garden generation. Wired in a later step (Gemini via fetch + budget cap).
  GEMINI_API_KEY?: string;
}
