/** Bindings declared in wrangler.toml, surfaced to the Worker + Durable Object. */
export interface Env {
  // One GameRoom Durable Object instance per room id.
  GAME_ROOM: DurableObjectNamespace;
  // Base URL of the ai-worker (guess/draw). Unset = AI features are skipped gracefully.
  AI_WORKER_URL?: string;
}
