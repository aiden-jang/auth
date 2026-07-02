import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";

const AI_ID = "ai-guesser";
const AI_NAME = "🤖 AI";

// AI-as-competing-guesser. The AI joins as a virtual participant and guesses
// alongside humans through the same scoring path. The actual guessing loop
// lives in the shared aiGuessLoop helper, composed here.
export class AIGuesserMode extends ClassicMode {
  override readonly id = "ai-guesser";

  private stop: (() => void) | null = null;

  // requestGuess renders the canvas and asks the vision model. Injected so
  // the mode stays free of HTTP/Redis. Optional → random stub in tests.
  constructor(private requestGuess?: () => Promise<string>) {
    super();
  }

  override configure(
    humans: PlayerRef[],
    ctx: EngineContext
  ): { totalTurns: number; turnsPerRound?: number } {
    this.drawOrder = humans.map((h) => h.id); // only humans draw
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return {
      totalTurns: this.drawOrder.length * this.rounds,
      turnsPerRound: this.drawOrder.length,
    };
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnStart(turn, ctx); // deliver word to the human drawer
    this.stop?.();
    this.stop = startGuessLoop(turn, ctx, {
      aiId: AI_ID,
      aiName: AI_NAME,
      requestGuess: this.requestGuess,
      onCorrect: () => this.acceptGuess(AI_ID, ctx),
    });
  }

  override onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    super.onTurnEnd(turn, ctx);
    this.stop?.();
    this.stop = null;
  }
}
