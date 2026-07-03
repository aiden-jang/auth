import type { DrawOp } from "@is-it-a-dog/shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";

const AI_ID = "ai-drawer";
const AI_NAME = "🤖 AI";
const TOTAL_ROUNDS = 3;

// AI-as-drawer. The AI is the sole drawer; humans race to guess. Drawing is
// produced through the shared aiDrawLoop helper (via ctx.draw). Guessing,
// scoring, and rotation are inherited unchanged from ClassicMode.
export class AIDrawerMode extends ClassicMode {
  override readonly id = "ai-drawer";

  private stop: (() => void) | null = null;

  // Optional injected generator (a future model). Falls back to the doodle
  // library inside the draw loop.
  constructor(private requestDrawing?: (word: string) => Promise<DrawOp[][]>) {
    super();
  }

  override configure(_humans: PlayerRef[], ctx: EngineContext): { totalTurns: number } {
    this.drawOrder = [AI_ID]; // only the AI ever draws
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: TOTAL_ROUNDS };
  }

  override pickDrawer(): string {
    return AI_ID;
  }

  // Only choose words we can actually draw.
  override pickWord(): string {
    return DOODLE_WORDS[Math.floor(Math.random() * DOODLE_WORDS.length)];
  }

  // The AI drawer picks its own word — no human "choosing" phase. Returning
  // null keeps the engine on the direct pickWord path.
  override pickWordChoices(): string[] | null {
    return null;
  }

  override canDraw(): boolean {
    return false; // no human draws; AI strokes arrive via ctx.draw, not sockets
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Deliberately do NOT call super.onTurnStart(): that delivers the secret
    // word to the drawer. Here the drawer is the AI and no human may see it.
    this.stop?.();
    this.stop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
  }
}
