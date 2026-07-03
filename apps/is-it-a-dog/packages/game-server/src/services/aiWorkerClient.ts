import type { DrawOp } from '@is-it-a-dog/shared';

const TIMEOUT_MS = 8_000;

// Thin HTTP client to the ai-worker. Resilient by design: any failure (worker down/unset,
// timeout, bad response) resolves to "" so the game never stalls waiting on the AI. The base
// URL is passed in (from the room's env) rather than read from process.env — this runs on Workers.
export async function requestAIGuess(baseUrl: string | undefined, ops: DrawOp[]): Promise<string> {
  if (!baseUrl || ops.length === 0) return '';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { guess?: string };
    return data.guess ?? '';
  } catch {
    return ''; // worker unreachable / timed out — skip this guess
  } finally {
    clearTimeout(t);
  }
}
