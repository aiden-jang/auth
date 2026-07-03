/** Bindings/secrets surfaced to the ai-worker. All optional — unset ⇒ the mock provider. */
export interface Env {
  // Force a provider: "mock" | "openai" | "anthropic". Otherwise: first available key, else mock.
  VISION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
}
