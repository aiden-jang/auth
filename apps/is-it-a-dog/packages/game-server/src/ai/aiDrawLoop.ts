import type { DrawOp } from "shared";
import type { EngineContext, TurnContext } from "../modes/GameMode.ts";
import { DOODLES } from "../doodles.ts";

// Extracted from AIDrawerMode so any mode can have an AI participant draw
// progressively. Mode policy (reveal cadence), not core-engine concern.
const REVEAL_MS = 1_500;

export interface DrawLoopOpts {
  // A future model generator. Falls back to the curated doodle library.
  requestDrawing?: (word: string) => Promise<DrawOp[][]>;
  revealMs?: number;
}

// Reveal the AI's drawing one stroke at a time via ctx.draw. Returns a stop
// fn the caller MUST invoke on turn end.
export function startDrawLoop(
  turn: TurnContext,
  ctx: EngineContext,
  opts: DrawLoopOpts = {}
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (interval) { clearInterval(interval); interval = null; }
  };

  const getDrawing = async (): Promise<DrawOp[][]> => {
    if (opts.requestDrawing) {
      try {
        const d = await opts.requestDrawing(turn.word);
        if (d?.length) return d;
      } catch {
        // fall through to the library
      }
    }
    return DOODLES[turn.word]?.() ?? [];
  };

  void (async () => {
    const strokes = await getDrawing();
    if (ctx.currentWord() !== turn.word) return; // turn outlived a slow generator
    let i = 0;
    const revealNext = () => {
      if (ctx.currentWord() !== turn.word || i >= strokes.length) { stop(); return; }
      for (const op of strokes[i]) ctx.draw(op);
      i++;
    };
    revealNext(); // first stroke immediately
    interval = setInterval(revealNext, opts.revealMs ?? REVEAL_MS);
  })();

  return stop;
}
