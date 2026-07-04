# Architecture

A deep-dive into how *is-it-a-dog* is built, why it's structured this way, and
what I'd change to take it to production. Written to be read top-to-bottom; each
section ends with the trade-off I actually made.

---

## 1. Core engine vs. mode plugins

The central design bet is that **the game timeline and the game rules are
different things and should never be tangled together.**

- **`engine.ts` (`GameEngine`)** owns the *timeline*: phases
  (`lobby → choosing → playing → intermission → ended`), the per-turn timer, the
  scoreboard, the "who has guessed" set, and broadcasting public state. It
  contains **zero game rules**. It does not know what a "word" means, who is
  allowed to draw, or how points are earned.
- **A `GameMode`** (the strategy) supplies every rule decision through a fixed
  set of hooks: `configure`, `pickDrawer`, `pickWord`, `pickWordChoices`
  (optional), `onTurnStart`, `onChat`, `canDraw`, `onTurnEnd`, `onGameEnd`.

The two halves meet through two narrow interfaces:

- **`EngineDeps`** — what the transport layer injects *into* the engine
  (`broadcast`, `sendToPlayer`, `clearCanvas`, `drawOp`, …). The engine never
  imports the transport or a store; it only knows these verbs. That's what makes
  it unit-testable and transport-agnostic — and it's exactly why the whole thing
  ported from a Node/`ws`/Redis process into a Cloudflare Durable Object without
  the engine or the modes changing at all (see §4).
- **`EngineContext`** — the verbs the engine hands *to* a mode
  (`awardPoints`, `endTurn`, `addParticipant`, `draw`, `turnFractionRemaining`,
  …). A mode never sees a socket, a store, or even the full engine — just this
  surface.

```
transport (worker.ts → GameRoom Durable Object)
      │  injects EngineDeps
      ▼
  GameEngine ── timeline, scoring bookkeeping
      │  exposes EngineContext
      ▼
  GameMode (strategy)
   ├─ ClassicMode      (humans only)
   ├─ AIGuesserMode    (+ AI guesser)
   ├─ AIDrawerMode     (AI draws)
   └─ TeamBattleMode   (Humans vs AI)
```

**Why this holds up:** three of the four modes were added *after* the engine
froze, and none required an engine change. `ClassicMode` is a concrete base;
the three AI modes extend or compose it. The only engine evolution the whole
project needed was a single new verb — see §6.

**Where shared *behavior* lives (and why not in the engine):** the AI's
interval guess loop and progressive draw-reveal loop are shared by multiple
modes, but they're **mode policy** (cadence, cost caps, reveal speed), not
timeline. So they live in composable helpers (`ai/aiGuessLoop.ts`,
`ai/aiDrawLoop.ts`) that modes *compose*, rather than in the engine or in a mode
base class. `TeamBattleMode` needs *both* loops and can't extend two mode
classes — that pressure is exactly what proved the helpers belong outside the
inheritance tree.

> **Decision — strategy + dependency injection over `if (mode === …)` branches
> or a deep inheritance chain.** Conditionals would have scattered each mode's
> rules across the engine; a tall inheritance chain breaks the moment one mode
> needs behavior from two ancestors (which `TeamBattleMode` does). Composition +
> a stable hook interface kept the engine at zero churn.

---

## 2. Real-time sync

The server is **authoritative**. Clients never talk to each other; every fact
flows through `broadcast`/`broadcastExcept`. The drawing model:

- **Streamed ops, not frames.** A stroke is a sequence of
  `start → move → end` ops (`shared/events.ts`), not a finished bitmap. Watchers
  see lines grow in real time, messages stay tiny, and the same op log replays
  perfectly for a late joiner (`canvas_sync`).
- **Normalized 0–1 coordinates.** A drawing made on an 800×600 canvas renders
  correctly on any client size — no server-side rescaling.
- **The drawer renders locally and is excluded from its own broadcast**
  (`broadcastExcept`). This hides round-trip latency for the person drawing
  while keeping everyone else server-driven.
- **Late joiners replay the log.** On connect, the server sends one
  `canvas_sync` containing the full ordered op list held in the room's Durable
  Object memory, so a mid-turn joiner catches up exactly.
- **`clear` truncates the log** rather than appending, and each turn starts with
  a clear — which also bounds how large the per-turn log can grow.

> **Decision — authoritative server over client prediction / P2P.** This is a
> trust boundary as much as a latency one: a cheating client can't fabricate
> game state because it has no authority over it. The cost is a round-trip for
> *remote* strokes; I hide it only for the local drawer. Because there's exactly
> one drawer per turn (a draw-lock, not a CRDT), I never need conflict
> resolution — a deliberate simplification versus collaborative drawing.

---

## 3. AI guessing — data flow, latency, cost

The vision model runs in a **separate `ai-worker` Worker**, never in the
WebSocket event loop.

```
game-server (GameRoom DO)           ai-worker (Worker)
  AIGuesserMode (timer)
     │ requestGuess()
     ▼
  aiWorkerClient ── HTTP POST /guess { ops } ──►  strokeSvg(ops) → PNG (resvg-wasm)
     ▲                                                   │
     │            { guess }                              ▼
     └────────────────────────────────────────  VisionProvider (Mock|OpenAI|Anthropic)
```

Key properties:

- **Off the hot path.** A slow vision call (hundreds of ms to seconds) can't
  block message handling or other rooms — it's an awaited HTTP call from inside
  a timer callback, not inline in the socket loop.
- **Resilient by construction.** Every failure mode in `aiWorkerClient`
  (worker down, timeout, non-200, malformed body) resolves to `""`, which the
  guess loop treats as "no guess this tick." The game never stalls on the AI.
- **Cost is bounded, not best-effort.** First guess is delayed 8s (an empty
  canvas isn't worth a call — `requestAIGuess` even short-circuits on an empty
  op list), then re-guesses every 10s, capped at 4 attempts per turn.
- **The secret word never leaves the trusted boundary.** Only stroke ops are
  sent to the worker; the word is delivered solely to the drawer via
  `your_word`. Anti-cheat (and privacy) is enforced by the *absence* of data,
  not by trusting a client.
- **Providers are swappable and auto-detected.** Mock / OpenAI / Anthropic
  behind one interface; the mock means the whole system runs with zero API keys.

> **Decision — interval snapshot polling over per-frame or final-image
> guessing.** Per-frame would be accurate but ruinously expensive and pointless
> (the canvas barely changes between frames). Guessing only the *final* image
> would kill the "AI races you live" feel. Interval polling with a hard cap is
> the middle that's both affordable and fun. **Decision — a separate worker over
> an inline call** so vision latency is isolated and the model tier can scale
> independently of the socket layer.

---

## 4. Scaling stateful WebSocket servers — the design, now realized by Durable Objects

This section originally described how I'd *hypothetically* scale a single Node
process horizontally. Porting to Cloudflare turned that design into the actual
implementation, so it's worth reading as "the problem, the approach I reasoned
out, and the runtime that happens to be that approach."

**The hard constraint: the engine is a single-writer.** Each room has one
authoritative timeline with one running timer. If two instances both ran a
room's engine, you'd get two timers, two "turn ended" events, double scoring.
So *whatever* the topology, **each room must have exactly one owning process at
a time.** That constraint is what ruled out the naive answers (fully stateless
instances + pub/sub relay solves *message delivery* but not *authority*; you'd
still get two timers). The approach that survives it is **route by room, not by
connection**: consistent-hash each room to one owning instance, keep in-room
broadcast a local in-memory fan-out, and make the owner's state rehydratable so
a failover is a *rehydrate*, not a *rebuild*.

**A Durable Object is exactly that owner, by construction.** In the Cloudflare
port, each room is one `GameRoom` Durable Object addressed by `idFromName(room)`.
The platform guarantees **at most one instance per id, globally, single-threaded**
— which is precisely the "exactly one owning process per room" invariant I'd
otherwise have to build with an L7 hash ring plus checkpoint/rehydrate plumbing.
So:

1. **Routing by room is the addressing model, not a gateway I run.** The
   `worker.ts` fetch handler derives the DO id from the room in the URL and hands
   the socket to that object. Cloudflare routes it to the one instance.
2. **In-room broadcast is a local in-memory fan-out.** The roster and stroke log
   live in the object's memory (no Redis, no per-message network hop) because the
   object *is* the single owner — there's no other instance to synchronize with.
3. **The timeline runs in the object.** The turn `setTimeout` lives inside the
   DO. To keep timers alive I use **pinned** WebSockets (`server.accept()`)
   rather than the hibernation API, since hibernation evicts pending timers — a
   deliberate cost trade (a live game keeps the object resident) for correctness.
4. **Durability is available without a second store.** State can be persisted to
   the object's own SQLite storage; today the game holds it in memory (a room's
   worth of state is small and a crash simply ends that game), which is the same
   "checkpoint is cheap because the state is small" observation from the original
   design.

> **Decision — Durable Objects over a hand-rolled room-affinity cluster.** The
> earlier plan (L7 consistent-hash by `roomId` + Redis checkpointing +
> rehydrate-on-failover) was the *right* design; a Durable Object is that design
> delivered as a primitive, minus the infrastructure I'd otherwise operate. The
> trade-offs are inherent to single-writer-per-room, not to the platform: a
> single hot room still can't be split across instances (fine for a party game —
> a room is a handful of people), and keeping timers alive means choosing pinned
> over hibernating sockets, so an idle-but-open room isn't free the way a
> hibernating one would be.

---

## 5. Decision log (X over Y)

| Decision | Chosen | Over | Reason |
|---|---|---|---|
| State authority | Authoritative server | Client prediction / P2P | Trust boundary + single source of truth |
| Transport | Raw `ws` | Socket.IO | Visibility into the protocol; no hidden reconnection/room magic to learn |
| Mode boundary | Strategy + DI | `if (mode)` branches / deep inheritance | Zero engine churn; supports a mode needing two behaviors |
| Shared AI behavior | Composable helpers | Mode base class / engine | It's policy, not timeline; one mode needs both loops |
| Canvas sync | Streamed ops | Snapshot images | Tiny messages, live growth, perfect replay, resolution-independent |
| AI guess timing | Interval + cap | Per-frame / final-only | Bounded cost without killing the live feel |
| AI vision | Separate Worker | Inline call | Isolate latency; scale the model tier independently |
| AI drawer art | Curated doodle library | Generative model | Legible, free, testable; a generator can slot behind the same injected callback |
| Team scoring | System messages + scoreboard | New `PublicGameState` fields | Team scoring is mode-specific; adding it to the shared contract is the wrong coupling |
| Room runtime | Durable Object per room | Node + Redis / stateless + pub-sub | Single-writer-per-room by construction; roster + strokes in-memory, no external store (§4) |
| WebSocket style | Pinned (`server.accept()`) | Hibernation API | The turn timer must survive; hibernation evicts pending timers |

---

## 6. The one place the engine had to evolve (and why that's a good story)

For the first three modes, strokes only ever originated from a human socket, so
the engine never needed a "draw" verb — human draw ops were persisted and
broadcast entirely in the transport layer. **AI-as-drawer broke that
assumption:** the AI must emit strokes *through the engine*, and they must be
persisted, or a mid-turn joiner's `canvas_sync` would miss them.

The fix was a single transport-agnostic verb — `ctx.draw(op)` (backed by
`EngineDeps.drawOp`) — that persists to the stroke log *and* broadcasts,
symmetric with the existing `clearCanvas()`. The engine still has no idea who or
why; it just stopped assuming strokes can only come from a socket. Discovering a
missing abstraction from a concrete new requirement — rather than speculating it
up front — is the design discipline I'm most happy with here.

---

## 7. Known limitations & what I'd do next

Honest list:

- **Reconnect now preserves identity** via a client-held `pid` on the connect
  URL: a dropped client rejoins as the same player (keeps score, draw order,
  drawer role), the drawer's secret word is re-delivered on reconnect, and an
  overlap reconnect no longer ends the turn or duplicates the roster entry.
  *Remaining:* the `pid` is client-asserted (a signed session token would stop
  one client claiming another's id), and a drawer dropping for longer than the
  reconnect gap still ends their turn (no grace period).
- **Error handling hardened:** the connect/close handlers are wrapped, the
  client guards malformed frames, and process-level `unhandledRejection` /
  `uncaughtException` handlers keep one bad async path from killing every room.
- **Basic flood protection:** a coarse per-connection token bucket (200 msg/s)
  drops pathological floods without throttling normal play. *Remaining:* no
  auth — anyone can join any room and `start_game`.
- **Horizontal scale is now the runtime, not a plan.** §4's design is
  implemented: one Durable Object per room gives single-writer-per-room by
  construction. What's *not* done is persisting engine state to the DO's SQLite
  storage — today a room's state is in-memory, so a rare object eviction ends
  that game rather than rehydrating it. That's the cheap, obvious next step now
  that the object owns the state.
- **Unit-tested core; integration coverage is the gap.** The engine, modes, and
  pure helpers have a committed suite (`pnpm --filter @is-it-a-dog/game-server
  test`) that drives the engine through whole games against in-memory
  `EngineDeps` — rounds, scoring, hints, forgiving-guess matching, and the
  word-choice phase. *Remaining:* no end-to-end test exercising the real
  WebSocket transport through the Durable Object; those paths are validated by
  hand (a two-browser playthrough).
- **No auth, by design.** Anyone can join any room and `start_game` — that's the
  intended "type a name, share a link" flow for a party game. A coarse
  per-connection token bucket (200 msg/s) drops pathological floods.
- **The AI drawer is canned, not generative.** It draws from a small doodle
  library. A model-based generator (LLM emitting stroke ops, or image→trace) can
  slot behind the existing injected `requestDrawing` callback without touching
  the mode.

**Next three things, in order:** (1) persist engine state to the DO's SQLite so a
room survives eviction; (2) an end-to-end test across the real WebSocket +
Durable Object; (3) signed session tokens + a reconnect grace period for the
drawer.
