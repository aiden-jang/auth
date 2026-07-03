import type { ClientMessage, ServerMessage, PlayerInfo, DrawOp } from '@is-it-a-dog/shared';
import { GameEngine } from './engine.ts';
import { ClassicMode } from './modes/ClassicMode.ts';
import { AIGuesserMode } from './modes/AIGuesserMode.ts';
import { AIDrawerMode } from './modes/AIDrawerMode.ts';
import { TeamBattleMode } from './modes/TeamBattleMode.ts';
import type { GameMode, PlayerRef } from './modes/GameMode.ts';
import { requestAIGuess } from './services/aiWorkerClient.ts';
import type { Env } from './env.ts';

// One Durable Object per room — the single authority for that room's game. Because we use
// standard (pinned, non-hibernation) WebSockets, the isolate stays alive while any player is
// connected, so the engine's setTimeout/setInterval timing works unchanged. Redis is gone: the
// roster + stroke history live in this object's memory (evicted only once the room fully empties).

const MSG_LIMIT_PER_SEC = 200; // coarse per-connection flood guard

interface Conn {
  ws: WebSocket;
  player: PlayerInfo;
  rate: { count: number; windowStart: number };
}

export class GameRoom {
  private conns = new Set<Conn>();
  private engine: GameEngine | null = null;
  private virtualPlayers = new Map<string, PlayerInfo>();
  private strokes: DrawOp[] = [];
  private roomId = 'lobby';

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    const url = new URL(request.url);
    this.roomId = (url.searchParams.get('room') || 'lobby').slice(0, 32);
    const name = (url.searchParams.get('name') || 'Anon').slice(0, 24);
    const modeName = url.searchParams.get('mode');
    // Client-asserted stable id so a reconnect keeps identity (score, draw order, drawer role).
    const pid = url.searchParams.get('pid');
    const id = pid ? pid.slice(0, 12) : crypto.randomUUID().slice(0, 8);
    const player: PlayerInfo = { id, name };

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept(); // standard WebSocket — keeps this DO isolate alive while connected
    const conn: Conn = { ws: server, player, rate: { count: 0, windowStart: Date.now() } };
    this.conns.add(conn);

    const game = this.gameFor(modeName);
    this.send(server, { type: 'welcome', you: player, roomId: this.roomId });
    this.send(server, { type: 'canvas_sync', ops: this.strokes });
    game.sendStateTo(player.id); // catch the joiner up (re-delivers word if they're the drawer)
    this.broadcastPresence();
    this.broadcast({ type: 'system', text: `${name} joined` });

    server.addEventListener('message', (event) => {
      if (!this.allow(conn)) return; // drop floods silently
      const raw = typeof event.data === 'string' ? event.data : '';
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw) as ClientMessage;
      } catch {
        return; // ignore malformed frames
      }
      this.handle(conn, msg);
    });

    const teardown = (): void => this.onClose(conn);
    server.addEventListener('close', teardown);
    server.addEventListener('error', teardown);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handle(conn: Conn, msg: ClientMessage): void {
    const game = this.engine;
    if (!game) return;
    const player = conn.player;
    if (msg.type === 'chat') {
      const text = msg.text.slice(0, 500).trim();
      if (!text) return;
      // The game inspects it first: a correct guess is consumed (scored, suppressed) here.
      const consumed = game.handleChat(player.id, text);
      if (!consumed) this.broadcast({ type: 'chat', from: player, text });
    } else if (msg.type === 'draw') {
      if (!game.canDraw(player.id)) return; // authoritative: only the drawer draws
      this.persist(msg.op);
      this.broadcastExcept(conn, { type: 'draw', op: msg.op });
    } else if (msg.type === 'start_game') {
      game.startGame([...this.conns].map((c) => c.player.id));
    } else if (msg.type === 'choose_word') {
      game.handleChooseWord(player.id, msg.word);
    }
  }

  private onClose(conn: Conn): void {
    if (!this.conns.has(conn)) return; // close + error can both fire
    this.conns.delete(conn);
    // Reconnect overlap: another live socket already holds this id → the player didn't leave.
    if (this.findConn(conn.player.id)) return;
    this.engine?.onPlayerLeave(conn.player.id);
    if (this.conns.size === 0) {
      // Room emptied — reset so a future session starts clean (and free memory before eviction).
      this.engine = null;
      this.strokes = [];
      this.virtualPlayers.clear();
      return;
    }
    this.broadcastPresence();
    this.broadcast({ type: 'system', text: `${conn.player.name} left` });
  }

  // --- engine wiring -------------------------------------------------------

  private gameFor(modeName: string | null): GameEngine {
    if (!this.engine) {
      this.engine = new GameEngine(
        {
          broadcast: (msg) => this.broadcast(msg),
          sendToPlayer: (playerId, msg) => {
            for (const c of this.conns) if (c.player.id === playerId) this.send(c.ws, msg);
          },
          clearCanvas: () => {
            this.strokes = [];
            this.broadcast({ type: 'draw', op: { kind: 'clear' } });
          },
          drawOp: (op) => {
            this.persist(op);
            this.broadcast({ type: 'draw', op });
          },
          getName: (playerId) =>
            this.findConn(playerId)?.player.name ?? this.virtualPlayers.get(playerId)?.name ?? 'Someone',
          addVirtualPlayer: (p: PlayerRef) => {
            this.virtualPlayers.set(p.id, { id: p.id, name: p.name });
            this.broadcastPresence();
          },
          removeVirtualPlayer: (id: string) => {
            this.virtualPlayers.delete(id);
            this.broadcastPresence();
          },
        },
        this.makeMode(modeName),
      );
    }
    return this.engine;
  }

  private makeMode(name: string | null): GameMode {
    const aiGuess = (): Promise<string> => requestAIGuess(this.env.AI_WORKER_URL, this.strokes);
    if (name === 'ai') return new AIGuesserMode(aiGuess);
    if (name === 'ai-drawer') return new AIDrawerMode();
    if (name === 'team-battle') return new TeamBattleMode(aiGuess);
    return new ClassicMode();
  }

  // --- socket helpers ------------------------------------------------------

  private persist(op: DrawOp): void {
    if (op.kind === 'clear') this.strokes = [];
    else this.strokes.push(op);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket is closing — drop it
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.conns) this.send(c.ws, msg);
  }

  private broadcastExcept(except: Conn, msg: ServerMessage): void {
    for (const c of this.conns) if (c !== except) this.send(c.ws, msg);
  }

  private presenceList(): PlayerInfo[] {
    const humans = new Map<string, PlayerInfo>();
    for (const c of this.conns) humans.set(c.player.id, c.player);
    return [...humans.values(), ...this.virtualPlayers.values()];
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', players: this.presenceList() });
  }

  private findConn(playerId: string): Conn | undefined {
    return [...this.conns].find((c) => c.player.id === playerId);
  }

  private allow(conn: Conn): boolean {
    const now = Date.now();
    if (now - conn.rate.windowStart >= 1000) {
      conn.rate.windowStart = now;
      conn.rate.count = 0;
    }
    conn.rate.count += 1;
    return conn.rate.count <= MSG_LIMIT_PER_SEC;
  }
}
