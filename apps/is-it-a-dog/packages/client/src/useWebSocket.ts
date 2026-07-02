import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ClientMessage,
  ServerMessage,
  PlayerInfo,
  DrawOp,
  PublicGameState,
} from "shared";

// Draw ops bypass React state on purpose: re-rendering a component on every
// pointer-move would be wasteful. Instead the canvas registers a listener and
// paints imperatively. `null` op signals a full reset before a canvas_sync.
type DrawListener = (op: DrawOp | { kind: "reset" }) => void;

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:8080";

export interface ChatLine {
  kind: "chat" | "system";
  from?: PlayerInfo;
  text: string;
}

// Owns the single persistent WebSocket connection and the derived view
// state (who you are, the roster, the message log). The component just
// renders this and calls `sendChat`.
export function useGameSocket(room: string, name: string, mode: string) {
  const [connected, setConnected] = useState(false);
  const [you, setYou] = useState<PlayerInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [log, setLog] = useState<ChatLine[]>([]);
  const [game, setGame] = useState<PublicGameState | null>(null);
  // The secret word, set only when WE are the drawer; cleared each turn end.
  const [myWord, setMyWord] = useState<string | null>(null);
  // Word options offered to US during the "choosing" phase; cleared once the
  // turn begins (or any non-choosing state arrives).
  const [wordChoices, setWordChoices] = useState<string[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const drawListeners = useRef<Set<DrawListener>>(new Set());

  const emitDraw = (op: DrawOp | { kind: "reset" }) => {
    for (const l of drawListeners.current) l(op);
  };

  useEffect(() => {
    if (!room || !name) return;
    // A stable per-session id so a dropped connection reconnects as the SAME
    // player (keeps score, draw order, drawer role). Generated once per effect
    // run and reused by every reconnect; resets only when room/name/mode change.
    const pid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 14);
    const url = `${SERVER_URL}/?room=${encodeURIComponent(
      room
    )}&name=${encodeURIComponent(name)}&mode=${encodeURIComponent(
      mode
    )}&pid=${encodeURIComponent(pid)}`;

    // `alive` distinguishes an intentional unmount (no reconnect) from a
    // dropped connection (reconnect with capped backoff). The server replays
    // full state on every connect, so reconnecting is enough to recover.
    let alive = true;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!alive) return;
        attempt += 1;
        const delay = Math.min(5000, 500 * attempt); // 0.5s → 5s cap
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return; // ignore malformed frames instead of breaking the pump
        }
        handle(msg);
      };
    };

    const handle = (msg: ServerMessage) => {
      switch (msg.type) {
        case "welcome":
          setYou(msg.you);
          break;
        case "presence":
          setPlayers(msg.players);
          break;
        case "chat":
          setLog((l) => [...l, { kind: "chat", from: msg.from, text: msg.text }]);
          break;
        case "system":
          setLog((l) => [...l, { kind: "system", text: msg.text }]);
          break;
        case "draw":
          emitDraw(msg.op);
          break;
        case "canvas_sync":
          emitDraw({ kind: "reset" });
          for (const op of msg.ops) emitDraw(op);
          break;
        case "game_state":
          setGame(msg.state);
          // If we're no longer the drawer, forget any word we held.
          setMyWord((w) => (msg.state.phase === "playing" ? w : null));
          // Choices are only relevant during our own "choosing" phase.
          if (msg.state.phase !== "choosing") setWordChoices(null);
          break;
        case "word_choices":
          setWordChoices(msg.words);
          break;
        case "your_word":
          setMyWord(msg.word);
          setWordChoices(null); // we picked → drop the options
          break;
        case "turn_end":
          setMyWord(null);
          setLog((l) => [
            ...l,
            { kind: "system", text: `The word was: ${msg.word}` },
          ]);
          break;
      }
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [room, name, mode]);

  const sendChat = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "chat", text };
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendDraw = useCallback((op: DrawOp) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: "draw", op };
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Canvas subscribes here to receive remote ops; returns an unsubscribe.
  const subscribeDraw = useCallback((fn: DrawListener) => {
    drawListeners.current.add(fn);
    return () => drawListeners.current.delete(fn);
  }, []);

  // Clear: tell the server (it wipes the log + relays) AND reset our own
  // canvas, since the server never echoes our own ops back to us.
  const clearBoard = useCallback(() => {
    sendDraw({ kind: "clear" });
    emitDraw({ kind: "reset" });
  }, [sendDraw]);

  const chooseWord = useCallback((word: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "choose_word", word } satisfies ClientMessage));
    }
  }, []);

  const startGame = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "start_game" } satisfies ClientMessage));
    }
  }, []);

  return {
    connected,
    you,
    players,
    log,
    game,
    myWord,
    wordChoices,
    sendChat,
    chooseWord,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
  };
}
