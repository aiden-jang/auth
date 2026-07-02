import type { DrawOp } from "shared";
import type { EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { ClassicMode } from "./ClassicMode.ts";
import { startGuessLoop } from "../ai/aiGuessLoop.ts";
import { startDrawLoop } from "../ai/aiDrawLoop.ts";
import { DOODLE_WORDS } from "../doodles.ts";
import { randomWord } from "../words.ts";
import { normalizeGuess } from "../text.ts";

const AI_ID = "ai-team";
const AI_NAME = "🤖 AI";
const ROUNDS = 4; // alternates: human draws / AI draws / human / AI

type Team = "human" | "ai";

// Humans vs AI — "guess race" interpretation. Each round has one drawer and
// one shared drawing; the first correct guess wins the round for its side.
// Most round-wins wins the game. Built entirely on ClassicMode + the shared
// AI helpers; no core-engine change. Team standings ride on system messages
// (deliberately NOT added to the shared PublicGameState contract).
export class TeamBattleMode extends ClassicMode {
  override readonly id = "team-battle";

  private humans: string[] = [];
  private aiDrawsThisTurn = false;
  private roundDecided = false;
  private wins: Record<Team, number> = { human: 0, ai: 0 };
  private stopLoop: (() => void) | null = null;

  constructor(
    private requestGuess?: () => Promise<string>,
    private requestDrawing?: (word: string) => Promise<DrawOp[][]>
  ) {
    super();
  }

  override configure(humans: PlayerRef[], ctx: EngineContext): { totalTurns: number } {
    this.humans = humans.map((h) => h.id);
    this.wins = { human: 0, ai: 0 };
    ctx.addParticipant({ id: AI_ID, name: AI_NAME, isAI: true });
    return { totalTurns: ROUNDS };
  }

  private isAITurn(turnIndex: number): boolean {
    return turnIndex % 2 === 1; // odd rounds: AI draws
  }

  // pickDrawer runs first each turn (engine startTurn), so we latch whether
  // the AI is drawing here and read it back in pickWord/canDraw.
  override pickDrawer(turnIndex: number): string {
    this.aiDrawsThisTurn = this.isAITurn(turnIndex);
    if (this.aiDrawsThisTurn) return AI_ID;
    return this.humans[Math.floor(turnIndex / 2) % this.humans.length];
  }

  override pickWord(): string {
    // AI-draw turns must use a word the doodle library can render.
    return this.aiDrawsThisTurn
      ? DOODLE_WORDS[Math.floor(Math.random() * DOODLE_WORDS.length)]
      : randomWord();
  }

  // Only the human drawer chooses a word. On AI-draw turns the AI picks its own
  // (doodle-renderable) word, so return null to skip the choosing phase.
  override pickWordChoices(ctx: EngineContext): string[] | null {
    return this.aiDrawsThisTurn ? null : super.pickWordChoices(ctx);
  }

  override canDraw(playerId: string, ctx: EngineContext): boolean {
    // Only a human drawer draws by hand; the AI draws via the draw loop.
    return !this.aiDrawsThisTurn && playerId === ctx.currentDrawerId();
  }

  override onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    this.roundDecided = false;
    this.stopLoop?.();

    if (this.aiDrawsThisTurn) {
      // 🤖 draws; only humans can win this round (the AI knows its own word).
      ctx.broadcast({
        type: "system",
        text: `Round ${turn.turnIndex + 1}: 🤖 Team AI is drawing — Team Human, guess!`,
      });
      this.stopLoop = startDrawLoop(turn, ctx, { requestDrawing: this.requestDrawing });
    } else {
      // A human draws; the AI races the human team to guess the same canvas.
      ctx.broadcast({
        type: "system",
        text: `Round ${turn.turnIndex + 1}: Team Human is drawing — 🤖 AI is racing you to guess!`,
      });
      super.onTurnStart(turn, ctx); // deliver the secret word to the human drawer
      this.stopLoop = startGuessLoop(turn, ctx, {
        aiId: AI_ID,
        aiName: AI_NAME,
        requestGuess: this.requestGuess,
        onCorrect: () => this.winRound("ai", AI_ID, ctx),
      });
    }
  }

  override onChat(playerId: string, text: string, ctx: EngineContext): boolean {
    const word = ctx.currentWord();
    if (!word) return false; // not a live turn → normal chat
    if (playerId === ctx.currentDrawerId()) return true; // hide drawer chat
    if (this.roundDecided) return false; // round already won → let chat through
    // Match human guesses the same forgiving-but-strict way ClassicMode does
    // (a sentence containing the word is NOT a win; the typed answer must be
    // the word, modulo case/accents/punctuation).
    if (normalizeGuess(text) === normalizeGuess(word)) {
      this.winRound("human", playerId, ctx);
      return true;
    }
    return false; // wrong guess → shows as normal chat
  }

  private winRound(team: Team, byId: string, ctx: EngineContext): void {
    if (this.roundDecided) return; // first correct guess only
    this.roundDecided = true;
    this.stopLoop?.();
    this.stopLoop = null;

    const word = ctx.currentWord() ?? "";
    this.wins[team] += 1;
    ctx.awardPoints(byId, 100); // individual scoreboard still moves
    ctx.markGuessed(byId);

    const label = team === "ai" ? "🤖 Team AI" : "Team Human";
    ctx.broadcast({
      type: "system",
      text: `${label} wins the round! (${ctx.getName(byId)} got "${word}") — Humans ${this.wins.human} : ${this.wins.ai} AI`,
    });
    ctx.syncState();
    ctx.endTurn();
  }

  // NB: deliberately does NOT call super.onTurnEnd — this mode owns its own
  // end-of-turn announcement (with team standings) for the no-guess case, so
  // the base "nobody got it" line would just duplicate it.
  override onTurnEnd(_turn: TurnContext, ctx: EngineContext): void {
    this.stopLoop?.();
    this.stopLoop = null;
    if (!this.roundDecided) {
      ctx.broadcast({
        type: "system",
        text: `Time! Nobody guessed it. — Humans ${this.wins.human} : ${this.wins.ai} AI`,
      });
    }
  }

  // Not on the ClassicMode base — declared optional on the GameMode interface.
  onGameEnd(ctx: EngineContext): void {
    const { human, ai } = this.wins;
    const verdict =
      human === ai ? "It's a tie! 🤝" : human > ai ? "🏆 Team Human wins!" : "🏆 Team AI wins!";
    ctx.broadcast({
      type: "system",
      text: `Game over — Humans ${human} : ${ai} AI. ${verdict}`,
    });
  }
}
