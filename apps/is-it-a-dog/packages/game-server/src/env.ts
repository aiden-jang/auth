/** Bindings declared in wrangler.toml, surfaced to the Worker + Durable Object. */
export interface Env {
  // One GameRoom Durable Object instance per room id.
  GAME_ROOM: DurableObjectNamespace;
  // The built client SPA (packages/client/dist), served from this same Worker.
  ASSETS: Fetcher;
  // Base URL of the ai-worker (guess/draw). Unset = AI features are skipped gracefully.
  AI_WORKER_URL?: string;
}
