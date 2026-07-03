import type { ServerMessage, PublicGameState, GamePhase, DrawOp } from "@is-it-a-dog/shared";
import type { GameMode, EngineContext, PlayerRef, TurnContext } from "./modes/GameMode.ts";

const TURN_MS = 60_000;
const INTERMISSION_MS = 5_000;
// How long the drawer has to pick a word before the engine auto-picks for them.
const CHOOSE_MS = 15_000;

// Transport-facing dependencies, injected by the WS layer. The engine never
// imports ws or redis — it only knows these verbs.
export interface EngineDeps {
  broadcast: (msg: ServerMessage) => void;
  sendToPlayer: (playerId: string, msg: ServerMessage) => void;
  clearCanvas: () => void | Promise<void>;
  // Emit a mode-originated draw op: persist to the stroke log AND broadcast.
  drawOp: (op: DrawOp) => void | Promise<void>;
  getName: (playerId: string) => string;
  // Reflect a virtual participant (AI) into room presence so it appears in
  // the roster/scoreboard like any other player.
  addVirtualPlayer: (p: PlayerRef) => void;
  removeVirtualPlayer: (id: string) => void;
}

// The engine owns the game *timeline* and shared bookkeeping. All
// game-specific decisions are delegated to the injected GameMode.
export class GameEngine {
  private phase: GamePhase = "lobby";
  private turnIndex = 0;
  private totalTurns = 0;
  // How many turns make up one round (every drawer drawing once). Reported by
  // the mode; defaults to the whole game (one round) when not provided.
  private turnsPerRound = 1;
  private drawerId: string | null = null;
  private word: string | null = null;
  private turnEndsAt: number | null = null;
  private guessed = new Set<string>();
  private scoreboard: Record<string, number> = {};
  private roster = new Map<string, PlayerRef>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Indices of the secret word already revealed to guessers this turn, plus
  // the timers that reveal them. Both are reset every turn.
  private revealed = new Set<number>();
  private revealTimers: ReturnType<typeof setTimeout>[] = [];
  // While in the "choosing" phase: the words offered to the drawer and the
  // timer that auto-picks one if they dawdle. Cleared when the turn begins.
  private pendingChoices: string[] | null = null;
  private chooseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: EngineDeps, private mode: GameMode) {}

  get currentPhase() {
    return this.phase;
  }

  canDraw(playerId: string): boolean {
    return this.mode.canDraw(playerId, this.ctx);
  }

  handleChat(playerId: string, text: string): boolean {
    return this.mode.onChat(playerId, text, this.ctx);
  }

  sendStateTo(playerId: string) {
    this.deps.sendToPlayer(playerId, {
      type: "game_state",
      state: this.publicState(),
    });
    // If the drawer reconnects mid-turn, re-deliver their secret word so they
    // can keep drawing. Only the drawer ever receives it.
    if (
      this.phase === "playing" &&
      playerId === this.drawerId &&
      this.word
    ) {
      this.deps.sendToPlayer(playerId, { type: "your_word", word: this.word });
    }
  }

  startGame(humanIds: string[]) {
    if (this.phase === "playing" || this.phase === "intermission") return;
    if (humanIds.length < 2) {
      this.deps.broadcast({
        type: "system",
        text: "Need at least 2 players to start.",
      });
      return;
    }

    // Drop any virtual players (e.g. an AI) left over from a previous game so
    // they don't accumulate in presence across replays. The mode re-adds the
    // ones it wants in configure().
    for (const p of this.roster.values()) {
      if (p.isAI) this.deps.removeVirtualPlayer(p.id);
    }

    // Reset and seed the roster with the human players.
    this.roster.clear();
    for (const id of humanIds) {
      this.roster.set(id, { id, name: this.deps.getName(id) });
    }

    // Let the mode configure the game (and add virtual players like the AI).
    const { totalTurns, turnsPerRound } = this.mode.configure(
      humanIds.map((id) => this.roster.get(id)!),
      this.ctx
    );

    this.totalTurns = totalTurns;
    // Fall back to a single round when the mode doesn't report a round size.
    this.turnsPerRound = Math.max(1, turnsPerRound ?? totalTurns);
    this.turnIndex = 0;
    this.scoreboard = Object.fromEntries(
      [...this.roster.keys()].map((id) => [id, 0])
    );
    this.startTurn();
  }

  onPlayerLeave(playerId: string) {
    if (this.phase !== "playing") return;
    if (playerId === this.drawerId) {
      this.deps.broadcast({
        type: "system",
        text: "The drawer left — ending the turn.",
      });
      this.endTurn();
    }
  }

  // ----- Turn lifecycle -----

  private startTurn() {
    const drawerId = this.mode.pickDrawer(this.turnIndex, this.ctx);

    // Offer the drawer a few words to choose from, if the mode opts in. Two or
    // more options trigger a "choosing" phase; anything less skips straight to
    // the turn with a mode-picked word (e.g. when an AI is drawing).
    const choices = this.mode.pickWordChoices?.(this.ctx) ?? null;
    if (choices && choices.length >= 2) {
      this.startChoosing(drawerId, choices);
      return;
    }

    this.beginTurn(drawerId, this.mode.pickWord(this.ctx));
  }

  // Enter the "choosing" phase: the drawer is known and the canvas is cleared,
  // but no word is live yet. Only the drawer sees the options; everyone else
  // sees a "choosing…" state. Auto-picks on timeout so a turn can't stall.
  private startChoosing(drawerId: string, choices: string[]) {
    this.phase = "choosing";
    this.drawerId = drawerId;
    this.word = null;
    this.turnEndsAt = null;
    this.guessed.clear();
    this.pendingChoices = choices;

    void this.deps.clearCanvas();
    this.deps.sendToPlayer(drawerId, { type: "word_choices", words: choices });
    this.broadcastState();

    this.chooseTimer = setTimeout(() => {
      // Drawer didn't pick in time — choose at random for them.
      const pick = choices[Math.floor(Math.random() * choices.length)]!;
      this.beginTurn(drawerId, pick);
    }, CHOOSE_MS);
  }

  // The drawer picked a word (or the choose-timeout fired). Validates the pick
  // came from the right player and is one of the offered options.
  handleChooseWord(playerId: string, word: string) {
    if (this.phase !== "choosing") return;
    if (playerId !== this.drawerId) return;
    if (!this.pendingChoices?.includes(word)) return;
    this.beginTurn(this.drawerId, word);
  }

  private beginTurn(drawerId: string, word: string) {
    if (this.chooseTimer) {
      clearTimeout(this.chooseTimer);
      this.chooseTimer = null;
    }
    this.pendingChoices = null;

    this.phase = "playing";
    this.drawerId = drawerId;
    this.word = word;
    this.turnEndsAt = Date.now() + TURN_MS;
    this.guessed.clear();
    this.scheduleHints(word);

    void this.deps.clearCanvas();
    this.deps.broadcast({
      type: "system",
      text: `${this.deps.getName(drawerId)} is drawing!`,
    });

    const turn: TurnContext = { turnIndex: this.turnIndex, drawerId, word };
    this.mode.onTurnStart(turn, this.ctx);
    this.broadcastState();

    this.timer = setTimeout(() => this.endTurn(), TURN_MS);
  }

  // Reveal a few letters over the course of the turn to keep guessers in it.
  // Reveals are spread evenly across the clock and capped so we never give the
  // whole word away (~a third, max 5). Index choice is random among letters.
  private scheduleHints(word: string) {
    this.clearRevealTimers();
    this.revealed.clear();
    const letterIdx = [...word]
      .map((ch, i) => (ch === " " ? -1 : i))
      .filter((i) => i >= 0);
    const maxReveals =
      letterIdx.length <= 1 ? 0 : Math.min(Math.ceil(letterIdx.length / 3), 5);
    // Fisher–Yates shuffle so revealed positions aren't always left-to-right.
    for (let i = letterIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letterIdx[i], letterIdx[j]] = [letterIdx[j]!, letterIdx[i]!];
    }
    for (let k = 0; k < maxReveals; k++) {
      const at = Math.round((TURN_MS * (k + 1)) / (maxReveals + 1));
      const idx = letterIdx[k]!;
      this.revealTimers.push(
        setTimeout(() => {
          this.revealed.add(idx);
          this.broadcastState();
        }, at)
      );
    }
  }

  private clearRevealTimers() {
    for (const t of this.revealTimers) clearTimeout(t);
    this.revealTimers = [];
  }

  // The masked word guessers see: revealed letters in place, "_" elsewhere.
  private computeHint(): string {
    if (!this.word) return "";
    return [...this.word]
      .map((ch, i) => (ch === " " ? " " : this.revealed.has(i) ? ch : "_"))
      .join("");
  }

  private endTurn() {
    if (this.phase !== "playing") return; // guard against double-end
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.clearRevealTimers();
    const word = this.word ?? "";
    const turn: TurnContext = {
      turnIndex: this.turnIndex,
      drawerId: this.drawerId ?? "",
      word,
    };

    this.phase = "intermission";
    this.turnEndsAt = null;
    this.deps.broadcast({ type: "turn_end", word, scores: this.scoreboard });
    this.mode.onTurnEnd(turn, this.ctx);
    this.broadcastState();

    this.turnIndex += 1;
    if (this.turnIndex >= this.totalTurns) {
      setTimeout(() => {
        this.phase = "ended";
        this.drawerId = null;
        this.word = null;
        this.mode.onGameEnd?.(this.ctx);
        this.broadcastState();
      }, INTERMISSION_MS);
    } else {
      setTimeout(() => this.startTurn(), INTERMISSION_MS);
    }
  }

  private broadcastState() {
    this.deps.broadcast({ type: "game_state", state: this.publicState() });
  }

  private publicState(): PublicGameState {
    const totalRounds = Math.max(1, Math.ceil(this.totalTurns / this.turnsPerRound));
    // Clamp so the post-increment end-of-game turnIndex can't overshoot.
    const round = Math.min(totalRounds, Math.floor(this.turnIndex / this.turnsPerRound) + 1);
    return {
      phase: this.phase,
      drawerId: this.drawerId,
      turnIndex: this.turnIndex,
      totalTurns: this.totalTurns,
      round,
      totalRounds,
      turnEndsAt: this.turnEndsAt,
      wordLength: this.word?.length ?? 0,
      hint: this.computeHint(),
      scores: this.scoreboard,
      guessedIds: [...this.guessed],
    };
  }

  // The narrow handle handed to the mode. Bound once; reads live engine state.
  private ctx: EngineContext = {
    participants: () => [...this.roster.values()],
    getName: (id) => this.roster.get(id)?.name ?? this.deps.getName(id),
    broadcast: (msg) => this.deps.broadcast(msg),
    sendToPlayer: (id, msg) => this.deps.sendToPlayer(id, msg),
    clearCanvas: () => void this.deps.clearCanvas(),
    draw: (op) => void this.deps.drawOp(op),
    awardPoints: (id, pts) => {
      this.scoreboard[id] = (this.scoreboard[id] ?? 0) + pts;
    },
    scores: () => this.scoreboard,
    markGuessed: (id) => this.guessed.add(id),
    guessedIds: () => [...this.guessed],
    hasGuessed: (id) => this.guessed.has(id),
    addParticipant: (p) => {
      this.roster.set(p.id, p);
      if (this.scoreboard[p.id] === undefined) this.scoreboard[p.id] = 0;
      if (p.isAI) this.deps.addVirtualPlayer(p);
    },
    removeParticipant: (id) => {
      const p = this.roster.get(id);
      this.roster.delete(id);
      if (p?.isAI) this.deps.removeVirtualPlayer(id);
    },
    currentDrawerId: () => this.drawerId,
    currentWord: () => this.word,
    turnFractionRemaining: () => {
      if (!this.turnEndsAt) return 0;
      return Math.max(0, Math.min(1, (this.turnEndsAt - Date.now()) / TURN_MS));
    },
    syncState: () => this.broadcastState(),
    endTurn: () => this.endTurn(),
  };
}
