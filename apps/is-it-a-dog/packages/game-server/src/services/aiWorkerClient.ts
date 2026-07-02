import type { DrawOp } from "shared";

const AI_WORKER_URL = process.env.AI_WORKER_URL ?? "http://localhost:8090";
const TIMEOUT_MS = 8_000;

// Thin HTTP client to the ai-worker. Resilient by design: any failure
// (worker down, timeout, bad response) resolves to "" so the game never
// stalls waiting on the AI.
export async function requestAIGuess(ops: DrawOp[]): Promise<string> {
  if (ops.length === 0) return "";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_WORKER_URL}/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
      signal: controller.signal,
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { guess?: string };
    return data.guess ?? "";
  } catch {
    return ""; // worker unreachable / timed out — skip this guess
  } finally {
    clearTimeout(t);
  }
}
