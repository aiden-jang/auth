import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  DrawOp,
} from "shared";
import { GameEngine } from "./engine.ts";
import { ClassicMode } from "./modes/ClassicMode.ts";
import { AIGuesserMode } from "./modes/AIGuesserMode.ts";
import { AIDrawerMode } from "./modes/AIDrawerMode.ts";
import { TeamBattleMode } from "./modes/TeamBattleMode.ts";
import type { GameMode, PlayerRef } from "./modes/GameMode.ts";
import { requestAIGuess } from "./services/aiWorkerClient.ts";

const PORT = Number(process.env.PORT ?? 8080);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const redis = new Redis(REDIS_URL);
redis.on("connect", () => console.log("[redis] connected"));
redis.on("error", (e) => console.error("[redis] error", e.message));

// Last-resort guards: an async slip in a handler shouldn't take the whole
// server (and every other room) down. Log loudly and stay up.
process.on("unhandledRejection", (reason) =>
  console.error("[fatal] unhandledRejection:", reason)
);
process.on("uncaughtException", (err) =>
  console.error("[fatal] uncaughtException:", err)
);

// In-memory registry of live sockets, grouped by room. The socket objects
// themselves can't live in Redis (they're process-local), so the server
// keeps connections in memory and uses Redis only for *durable* state that
// must survive a restart or be shared across future server instances.
type Conn = {
  ws: WebSocket;
  player: PlayerInfo;
  roomId: string;
  // Coarse per-connection flood guard (token bucket, see allowMessage).
  rate: { count: number; windowStart: number };
};

// Allow up to this many client messages per second per connection. Generous
// headroom over the client's rAF-batched draw stream (~60/s) — this only stops
// pathological floods, it won't throttle normal play.
const MSG_LIMIT_PER_SEC = 200;
function allowMessage(conn: Conn): boolean {
  const now = Date.now();
  if (now - conn.rate.windowStart >= 1000) {
    conn.rate.windowStart = now;
    conn.rate.count = 0;
  }
  conn.rate.count += 1;
  return conn.rate.count <= MSG_LIMIT_PER_SEC;
}
const rooms = new Map<string, Set<Conn>>();

// One game engine per room, created lazily on first connection.
const games = new Map<string, GameEngine>();

// Virtual (non-socket) players per room — e.g. the AI. Merged into presence
// so they show up in the roster/scoreboard like any human.
const virtualPlayers = new Map<string, Map<string, PlayerInfo>>();

function connsInRoom(roomId: string): Conn[] {
  return [...(rooms.get(roomId) ?? [])];
}

function findConn(roomId: string, playerId: string): Conn | undefined {
  return connsInRoom(roomId).find((c) => c.player.id === playerId);
}

function connsForPlayer(roomId: string, playerId: string): Conn[] {
  return connsInRoom(roomId).filter((c) => c.player.id === playerId);
}

function makeMode(name: string | null, roomId: string): GameMode {
  if (name === "ai") {
    // Bind the AI's guess function to this room: render the current stroke
    // log (via the worker) and return the model's guess.
    return new AIGuesserMode(async () => requestAIGuess(await strokeHistory(roomId)));
  }
  if (name === "ai-drawer") {
    // No generator injected → uses the curated doodle library.
    return new AIDrawerMode();
  }
  if (name === "team-battle") {
    // AI guesses (on human-draw turns) via the worker; draws (on AI-draw
    // turns) via the doodle library.
    return new TeamBattleMode(async () => requestAIGuess(await strokeHistory(roomId)));
  }
  return new ClassicMode();
}

// Build (or fetch) the engine for a room, wiring its dependencies to the
// socket/Redis layer. The engine + mode stay transport-agnostic.
function gameFor(roomId: string, modeName: string | null): GameEngine {
  let g = games.get(roomId);
  if (!g) {
    g = new GameEngine(
      {
        broadcast: (msg) => broadcast(roomId, msg),
        sendToPlayer: (playerId, msg) => {
          // Fan out to every socket holding this id. During a reconnect overlap
          // both the old and new socket share the id; targeting only the first
          // would deliver to the dying connection.
          for (const c of connsForPlayer(roomId, playerId)) send(c.ws, msg);
        },
        clearCanvas: async () => {
          await redis.del(redisStrokesKey(roomId));
          broadcast(roomId, { type: "draw", op: { kind: "clear" } });
        },
        // Mode-originated stroke (AI drawer): same persist + broadcast path a
        // human socket draw takes, so late joiners replay it via canvas_sync.
        drawOp: async (op) => {
          await persistDrawOp(roomId, op);
          broadcast(roomId, { type: "draw", op });
        },
        getName: (playerId) =>
          findConn(roomId, playerId)?.player.name ??
          virtualPlayers.get(roomId)?.get(playerId)?.name ??
          "Someone",
        addVirtualPlayer: (p: PlayerRef) => {
          if (!virtualPlayers.has(roomId)) virtualPlayers.set(roomId, new Map());
          virtualPlayers.get(roomId)!.set(p.id, { id: p.id, name: p.name });
          void broadcastPresence(roomId);
        },
        removeVirtualPlayer: (id: string) => {
          virtualPlayers.get(roomId)?.delete(id);
          void broadcastPresence(roomId);
        },
      },
      makeMode(modeName, roomId)
    );
    games.set(roomId, g);
  }
  return g;
}

function redisRoomKey(roomId: string) {
  return `room:${roomId}:players`;
}

function redisStrokesKey(roomId: string) {
  return `room:${roomId}:strokes`;
}

// Send one typed message to a single socket.
function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Fan a message out to everyone currently in a room. This is the core
// "authoritative server broadcasts truth" primitive — clients never talk
// to each other directly, only through here.
function broadcast(roomId: string, msg: ServerMessage) {
  const conns = rooms.get(roomId);
  if (!conns) return;
  for (const c of conns) send(c.ws, msg);
}

// Like broadcast, but skips one connection — used for draw ops, since the
// drawer already painted the stroke locally and must not draw it twice.
function broadcastExcept(roomId: string, except: Conn, msg: ServerMessage) {
  const conns = rooms.get(roomId);
  if (!conns) return;
  for (const c of conns) if (c !== except) send(c.ws, msg);
}

// Persist a draw op to the room's ordered log so late joiners can replay it.
// `clear` resets the log instead of appending.
async function persistDrawOp(roomId: string, op: DrawOp) {
  const key = redisStrokesKey(roomId);
  if (op.kind === "clear") {
    await redis.del(key);
  } else {
    await redis.rpush(key, JSON.stringify(op));
  }
}

async function strokeHistory(roomId: string): Promise<DrawOp[]> {
  const raw = await redis.lrange(redisStrokesKey(roomId), 0, -1);
  return raw.map((s) => JSON.parse(s) as DrawOp);
}

async function presenceList(roomId: string): Promise<PlayerInfo[]> {
  const hash = await redis.hgetall(redisRoomKey(roomId));
  const humans = Object.entries(hash).map(([id, name]) => ({ id, name }));
  const virtuals = [...(virtualPlayers.get(roomId)?.values() ?? [])];
  return [...humans, ...virtuals];
}

async function broadcastPresence(roomId: string) {
  broadcast(roomId, { type: "presence", players: await presenceList(roomId) });
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[ws] listening on :${PORT}`);

wss.on("connection", async (ws, req) => {
  // Connection params arrive in the URL query string:
  //   ws://host:8080/?room=abc&name=Alice
  const url = new URL(req.url ?? "", "http://localhost");
  const roomId = (url.searchParams.get("room") || "lobby").slice(0, 32);
  const name = (url.searchParams.get("name") || "Anon").slice(0, 24);
  // Mode is fixed per room at creation (first connection wins): ?mode=ai
  const modeName = url.searchParams.get("mode");
  // A client supplies a stable `pid` so a reconnect keeps its identity (score,
  // draw order, drawer role). Falls back to a fresh id for first connects.
  // NOTE: this is client-asserted — fine for a demo; production would bind it
  // to a signed session token to stop a client claiming another's id.
  const pid = url.searchParams.get("pid");
  const id = pid ? pid.slice(0, 12) : randomUUID().slice(0, 8);
  const player: PlayerInfo = { id, name };

  const conn: Conn = { ws, player, roomId, rate: { count: 0, windowStart: Date.now() } };
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(conn);

  const game = gameFor(roomId, modeName);
  try {
    await redis.hset(redisRoomKey(roomId), player.id, player.name);

    // Tell the new player who they are, replay the canvas so they catch up,
    // then refresh everyone's roster.
    send(ws, { type: "welcome", you: player, roomId });
    send(ws, { type: "canvas_sync", ops: await strokeHistory(roomId) });
    game.sendStateTo(player.id); // catch the joiner up (re-delivers word if drawer)
    broadcast(roomId, { type: "presence", players: await presenceList(roomId) });
    broadcast(roomId, { type: "system", text: `${name} joined` });
  } catch (e) {
    console.error("[ws] join setup failed:", (e as Error).message);
    ws.close();
    return;
  }

  ws.on("message", (raw) => {
    if (!allowMessage(conn)) return; // drop floods silently
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    if (msg.type === "chat") {
      const text = msg.text.slice(0, 500).trim();
      if (!text) return;
      // Let the game inspect it first: a correct guess is consumed here
      // (suppressed + scored) and never broadcast as plain chat.
      const consumed = game.handleChat(player.id, text);
      if (!consumed) broadcast(roomId, { type: "chat", from: player, text });
    } else if (msg.type === "draw") {
      // Authoritative gate: ignore draw ops from anyone but the current
      // drawer. Client-side disabling is just UX; this is the real rule.
      if (!game.canDraw(player.id)) return;
      void persistDrawOp(roomId, msg.op);
      broadcastExcept(roomId, conn, { type: "draw", op: msg.op });
    } else if (msg.type === "start_game") {
      game.startGame(connsInRoom(roomId).map((c) => c.player.id));
    } else if (msg.type === "choose_word") {
      // Only honored while this player is the drawer in the "choosing" phase;
      // the engine validates the pick is one of the offered options.
      game.handleChooseWord(player.id, msg.word);
    }
  });

  ws.on("close", async () => {
    try {
      rooms.get(roomId)?.delete(conn);

      // Reconnect overlap: if another live connection already holds this same
      // player id, the player hasn't really left — skip teardown so we don't
      // end their turn or remove them from presence.
      if (findConn(roomId, player.id)) return;

      game.onPlayerLeave(player.id); // may end the turn if the drawer left
      if (rooms.get(roomId)?.size === 0) {
        rooms.delete(roomId);
        games.delete(roomId); // tear down the game with the empty room
        virtualPlayers.delete(roomId); // drop the AI with it
        // Empty room → discard the canvas so it doesn't haunt the next session.
        await redis.del(redisStrokesKey(roomId));
      }
      await redis.hdel(redisRoomKey(roomId), player.id);
      broadcast(roomId, { type: "presence", players: await presenceList(roomId) });
      broadcast(roomId, { type: "system", text: `${name} left` });
    } catch (e) {
      console.error("[ws] close cleanup failed:", (e as Error).message);
    }
  });
});

// Graceful shutdown: presence lives in Redis (so the roster survives across
// instances and reconnects), but that means a process that dies without
// running its `ws.close` handlers leaves orphaned player rows behind — ghosts
// that inflate the scoreboard and desync the "enough players to start" check
// against the live sockets. On a clean SIGINT/SIGTERM (Ctrl-C, `tsx watch`
// reload, container stop) we own these rows, so remove only *this* instance's
// players before exiting. (SIGKILL/crash can still orphan rows; surviving that
// would need per-player TTL heartbeats, which is more than this demo needs.)
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ws] ${signal} received, cleaning up presence…`);
  try {
    await Promise.all(
      [...rooms.entries()].map(async ([roomId, conns]) => {
        const ids = [...conns].map((c) => c.player.id);
        if (ids.length) await redis.hdel(redisRoomKey(roomId), ...ids);
      })
    );
  } catch (e) {
    console.error("[ws] shutdown cleanup failed:", (e as Error).message);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
