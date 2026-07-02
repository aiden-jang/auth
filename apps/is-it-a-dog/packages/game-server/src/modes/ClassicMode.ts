import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./GameMode.ts";
import { WORDS, randomWord } from "../words.ts";
import { normalizeGuess, isClose } from "../text.ts";

export { WORDS }; // re-export so AIGuesserMode's fallback can reuse it

// Classic skribbl-style mode: humans take turns drawing, everyone else
// guesses. Designed as the base class — AIGuesserMode extends it to add a
// virtual AI guesser without touching the engine.
export class ClassicMode implements GameMode {
  readonly id: string = "classic";

  // Ordered list of player ids eligible to draw. Captured at configure.
  protected drawOrder: string[] = [];

  // How many times the draw order repeats — each player draws once per round.
  // skribbl's default is 3; pickDrawer already wraps via modulo so rotation
  // continues correctly across rounds.
  protected rounds: number;

  // Words already used this game — so the 3 rounds don't recycle the same
  // prompt. Reset each game in configure().
  private usedWords = new Set<string>();

  constructor(rounds = 3) {
    this.rounds = Math.max(1, rounds);
  }

  configure(
    humans: PlayerRef[],
    _ctx: EngineContext
  ): { totalTurns: number; turnsPerRound?: number } {
    this.drawOrder = humans.map((h) => h.id);
    this.usedWords.clear();
    return {
      totalTurns: this.drawOrder.length * this.rounds,
      turnsPerRound: this.drawOrder.length,
    };
  }

  pickDrawer(turnIndex: number, _ctx: EngineContext): string {
    return this.drawOrder[turnIndex % this.drawOrder.length];
  }

  pickWord(_ctx: EngineContext): string {
    const word = this.freshWord();
    this.usedWords.add(word);
    return word;
  }

  // Offer the drawer three distinct, unused words to choose from. The engine
  // turns this into a "choosing" phase; whichever word the drawer picks becomes
  // live. We reserve all three as used so they don't recur later this game.
  pickWordChoices(_ctx: EngineContext): string[] | null {
    const choices: string[] = [];
    while (choices.length < 3 && choices.length < WORDS.length) {
      const word = this.freshWord();
      if (choices.includes(word)) continue;
      choices.push(word);
      this.usedWords.add(word);
    }
    return choices;
  }

  // Pick one word not yet used this game (without marking it used — callers
  // decide what to reserve). Resets the pool if exhausted so we never dead-end.
  private freshWord(): string {
    if (this.usedWords.size >= WORDS.length) this.usedWords.clear();
    let word = randomWord();
    // A few random retries, then a linear fallback that guarantees an unused
    // pick when the pool is nearly full.
    for (let i = 0; i < 20 && this.usedWords.has(word); i++) word = randomWord();
    if (this.usedWords.has(word)) {
      word = WORDS.find((w) => !this.usedWords.has(w)) ?? word;
    }
    return word;
  }

  onTurnStart(turn: TurnContext, ctx: EngineContext): void {
    // Secret word goes ONLY to the drawer.
    ctx.sendToPlayer(turn.drawerId, { type: "your_word", word: turn.word });
  }

  onChat(playerId: string, text: string, ctx: EngineContext): boolean {
    const word = ctx.currentWord();
    if (!word) return false; // not in a live turn → normal chat
    if (playerId === ctx.currentDrawerId()) return true; // hide drawer chat
    if (ctx.hasGuessed(playerId)) return true; // already done → stay quiet
    // Normalize both sides so punctuation, accents, casing and stray spaces
    // don't stand between a guesser and an obviously-correct answer.
    const guess = normalizeGuess(text);
    const target = normalizeGuess(word);
    if (guess !== target) {
      // A near-miss? Privately nudge just this guesser so they lean in —
      // the wrong guess still passes through to the public chat as normal.
      if (isClose(guess, target)) {
        ctx.sendToPlayer(playerId, { type: "system", text: "🔥 so close!" });
      }
      return false;
    }
    this.acceptGuess(playerId, ctx);
    return true;
  }

  canDraw(playerId: string, ctx: EngineContext): boolean {
    return playerId === ctx.currentDrawerId();
  }

  onTurnEnd(turn: TurnContext, ctx: EngineContext): void {
    // A whiff: the turn ran out with no correct guesses. The word is already
    // revealed in the turn_end message, so naming it here leaks nothing.
    if (ctx.guessedIds().length === 0) {
      ctx.broadcast({ type: "system", text: `oof — nobody got "${turn.word}" 💀` });
    }
  }

  onGameEnd(ctx: EngineContext): void {
    ctx.broadcast({ type: "system", text: winnerLine(ctx) });
  }

  // ----- Shared scoring helpers (reused by subclasses) -----

  /** Award a correct guesser + the drawer, announce it, maybe end the turn. */
  protected acceptGuess(playerId: string, ctx: EngineContext): void {
    const frac = ctx.turnFractionRemaining();
    const points = 50 + Math.round(frac * 50); // 50..100 by speed
    ctx.awardPoints(playerId, points);
    ctx.markGuessed(playerId);

    const drawerId = ctx.currentDrawerId();
    if (drawerId) ctx.awardPoints(drawerId, 25); // drawer bonus per guesser

    ctx.broadcast({
      type: "system",
      text: `${ctx.getName(playerId)} guessed the word! (+${points})`,
    });
    ctx.syncState();
    this.maybeEndTurn(ctx);
  }

  /** End the turn once every non-drawer participant has guessed. */
  protected maybeEndTurn(ctx: EngineContext): void {
    const drawerId = ctx.currentDrawerId();
    const expected = ctx
      .participants()
      .filter((p) => p.id !== drawerId).length;
    if (ctx.guessedIds().length >= expected) ctx.endTurn();
  }
}

// The end-of-game announcement: who won and with how many points. Handles a
// tie (multiple players sharing the top score) and the degenerate all-zero
// game gracefully. Exported for testing.
export function winnerLine(ctx: EngineContext): string {
  const scores = ctx.scores();
  const ids = ctx.participants().map((p) => p.id);
  if (ids.length === 0) return "🏁 game over!";
  const top = Math.max(...ids.map((id) => scores[id] ?? 0));
  if (top <= 0) return "🏁 game over — nobody scored. brutal.";
  const winners = ids.filter((id) => (scores[id] ?? 0) === top);
  const names = winners.map((id) => ctx.getName(id));
  if (names.length === 1) return `🏆 ${names[0]} wins with ${top} points!`;
  const joined =
    names.length === 2
      ? names.join(" & ")
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return `🏆 it's a tie! ${joined} share the W with ${top} points each.`;
}
