import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage } from "@is-it-a-dog/shared";
import type { EngineContext, PlayerRef } from "./GameMode.ts";
import { TeamBattleMode } from "./TeamBattleMode.ts";

// A minimal in-memory EngineContext for exercising the mode's chat/scoring
// logic without the engine, sockets, or timers. Only the verbs the mode
// touches are implemented; the rest throw if unexpectedly called.
function makeCtx(word: string, drawerId: string) {
  const broadcasts: ServerMessage[] = [];
  const scores: Record<string, number> = {};
  const guessed = new Set<string>();
  let ended = false;
  const ctx = {
    participants: () => [] as PlayerRef[],
    getName: (id: string) => id,
    broadcast: (m: ServerMessage) => broadcasts.push(m),
    sendToPlayer: () => {},
    awardPoints: (id: string, pts: number) => (scores[id] = (scores[id] ?? 0) + pts),
    scores: () => scores,
    markGuessed: (id: string) => guessed.add(id),
    guessedIds: () => [...guessed],
    hasGuessed: (id: string) => guessed.has(id),
    addParticipant: () => {},
    currentDrawerId: () => drawerId,
    currentWord: () => word,
    syncState: () => {},
    endTurn: () => { ended = true; },
  } as unknown as EngineContext;
  return { ctx, broadcasts, scores, guessed, isEnded: () => ended };
}

// Put the mode on a human-draw turn (even turnIndex) with a known word.
function humanDrawTurn(word: string) {
  const mode = new TeamBattleMode();
  const drawerId = "drawer";
  const { ctx, ...rec } = makeCtx(word, drawerId);
  mode.configure([{ id: drawerId, name: "drawer" }, { id: "g", name: "guesser" }], ctx);
  mode.pickDrawer(0); // turn 0 → human draws (latches aiDrawsThisTurn=false)
  return { mode, ctx, drawerId, ...rec };
}

test("a human's exact answer wins the round (forgiving of formatting)", () => {
  const { mode, ctx, scores, guessed, isEnded } = humanDrawTurn("ice cream");
  const handled = mode.onChat("g", "  ICE-CREAM!! ", ctx);
  assert.equal(handled, true);
  assert.equal(scores["g"], 100);
  assert.ok(guessed.has("g"));
  assert.ok(isEnded(), "a correct guess should end the round");
});

test("a sentence merely containing the word does NOT win", () => {
  const { mode, ctx, scores, isEnded } = humanDrawTurn("dog");
  const handled = mode.onChat("g", "is it a dog or something", ctx);
  assert.equal(handled, false, "substring match must not count as a human guess");
  assert.equal(scores["g"], undefined);
  assert.ok(!isEnded());
});

test("the drawer's own chat is never treated as a guess", () => {
  const { mode, ctx, drawerId, isEnded } = humanDrawTurn("dog");
  assert.equal(mode.onChat(drawerId, "dog", ctx), true); // swallowed
  assert.ok(!isEnded());
});

test("after the round is decided, further guesses pass through as chat", () => {
  const { mode, ctx } = humanDrawTurn("dog");
  mode.onChat("g", "dog", ctx); // wins, round decided
  assert.equal(mode.onChat("g2", "dog", ctx), false);
});
