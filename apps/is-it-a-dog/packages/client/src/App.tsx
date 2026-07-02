import { useEffect, useRef, useState } from "react";
import { useGameSocket } from "./useWebSocket";
import { DrawingCanvas } from "./DrawingCanvas";

const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

const MODES = [
  { value: "classic", label: "Classic", blurb: "just vibes, no bots", icon: "🎨" },
  { value: "ai", label: "AI Guesser", blurb: "bot thinks it ate", icon: "🔍" },
  { value: "ai-drawer", label: "AI Drawer", blurb: "bot draws, it's giving???", icon: "🖌️" },
  { value: "team-battle", label: "Team Battle", blurb: "humans vs the bots fr", icon: "⚔️" },
];

const isAI = (id?: string | null) => !!id && id.startsWith("ai-");

// Rotating join-screen taglines — keeps the landing feeling alive.
const TAGLINES = [
  "probably not. draw it anyway, no cap.",
  "your art skills? questionable. your vibes? immaculate.",
  "warning: contains 100% organic chaos 🧪",
  "the bot is judging your circles rn",
  "ms paint energy, olympic confidence",
  "draw bad, win anyway. that's the lore.",
  "it's not deep. it's a doodle. relax.",
  "9 outta 10 dentists can't draw a molar either",
  "your hand: shaking. your aura: unmatched.",
  "the gworls are doodling. casually.",
];

// Funny throwaway handles for the dice button.
const NAME_ADJ = ["sleepy", "feral", "based", "soggy", "spicy", "chaotic", "lowkey", "sus", "gigarad", "unhinged", "moist", "elite"];
const NAME_NOUN = ["goblin", "pigeon", "raccoon", "doodler", "gamer", "wizard", "shrimp", "menace", "legend", "noodle", "gremlin", "duck"];
function randomName(): string {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a}_${n}${Math.floor(Math.random() * 90 + 10)}`;
}

// ---- Win streak (localStorage) ----
const STREAK_KEY = "iiad_streak";
function getStreak(): number {
  return Number(localStorage.getItem(STREAK_KEY) || 0) || 0;
}
function bumpStreak(won: boolean): number {
  const next = won ? getStreak() + 1 : 0;
  localStorage.setItem(STREAK_KEY, String(next));
  return next;
}

// ---- Sound FX (WebAudio, no assets) ----
const MUTE_KEY = "iiad_muted";
let audioCtx: AudioContext | null = null;
function blip(freqs: number[], muted: boolean) {
  if (muted) return;
  try {
    audioCtx =
      audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    /* audio not available — no-op */
  }
}

// Export the canvas as a downloadable PNG (white background baked in).
function saveCanvasPng(canvas: HTMLCanvasElement, room: string) {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (!c) return;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  const a = document.createElement("a");
  a.download = `is-it-a-dog-${room}-${Date.now()}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
}

// Open a pre-filled X/Twitter compose window — the actual viral loop.
function shareToX(text: string) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// Lightweight emoji confetti — no deps. Renders a burst of falling emoji that
// auto-clears after the animation. Fired on a win.
function Confetti({ go, count = 48 }: { go: boolean; count?: number }) {
  const [pieces, setPieces] = useState<
    { id: number; left: number; delay: number; dur: number; emoji: string }[]
  >([]);
  useEffect(() => {
    if (!go) return;
    const emojis = ["🎉", "🎨", "🐶", "🔥", "💀", "✨", "🏆", "💅", "🤖"];
    const burst = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.4 + Math.random() * 1.8,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setPieces(burst);
    const t = setTimeout(() => setPieces([]), 4800);
    return () => clearTimeout(t);
  }, [go, count]);
  if (pieces.length === 0) return null;
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="confetti-piece"
          style={{
            left: `${p.left}vw`,
            animation: `confettiFall ${p.dur}s linear ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </>
  );
}

const REACTIONS = ["😂", "🔥", "💀", "👏", "😭", "🐶"];

// Randomized end-of-game stings so the payoff hits different every time.
const WIN_LINES = [
  "🏆 you ate that up",
  "🏆 no crumbs left. devoured.",
  "🏆 first place, zero notes",
  "🏆 certified W, frame it",
];
const LOSS_LINES = [
  "💀 it's giving L… run it back",
  "💀 not the algorithm cooking you",
  "💀 took an L with full chest, respect",
  "💀 we move. silently. run it back",
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// Sassy bot commentary, cycled while an AI is in the room.
const HOT_TAKES = [
  "hmm… is it a dog? 🤔",
  "my circuits say goose. final answer.",
  "bestie what IS that 💀",
  "I've seen better strokes in my training data",
  "is that art or a ransom note?",
  "calculating… nope still confused",
  "bold of you to call that a circle",
  "I'm an AI and even I can't cope rn",
  "respectfully… what is the lore here",
  "this passed the vibe check, not the eye check",
  "I'd guess but I left my glasses in the cloud",
  "drawing this hard? in THIS economy?",
  "404: object not found (it's giving abstract)",
];

// Animated "…" — three bouncing dots for live status text.
function Dots() {
  return (
    <span aria-hidden>
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}

// Copy text to the clipboard with a graceful fallback for older/insecure
// contexts (clipboard API needs https or localhost).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

// Build a shareable deep link that drops a friend straight into this room +
// mode. Name is left out so they pick their own.
function inviteLink(room: string, mode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams({ room, mode });
  return `${base}#${q.toString()}`;
}

// Read room/mode/name from the URL hash so an invite link pre-fills the gate.
function readInvite(): { room?: string; mode?: string; name?: string } {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return {};
  const q = new URLSearchParams(raw);
  return {
    room: q.get("room") ?? undefined,
    mode: q.get("mode") ?? undefined,
    name: q.get("name") ?? undefined,
  };
}

function widthDot(w: number, c: string, on: boolean): React.CSSProperties {
  return {
    width: Math.max(6, Math.min(28, w)),
    height: Math.max(6, Math.min(28, w)),
    borderRadius: "50%",
    background: c === "#ffffff" ? "#ffffff" : c,
    border: c === "#ffffff" ? "1px solid #44495a" : "none",
    opacity: on ? 1 : 0.35,
    flexShrink: 0,
  };
}

export function App() {
  // An invite link (#room=…&mode=…) pre-fills the gate so a friend lands in the
  // same room + mode and only has to type a name.
  const invite = readInvite();
  const invited = !!invite.room;
  // Returning players skip the typing: remember the last name/room locally.
  const [draftName, setDraftName] = useState(
    invite.name ?? localStorage.getItem("iiad_name") ?? ""
  );
  const [draftRoom, setDraftRoom] = useState(
    invite.room ?? localStorage.getItem("iiad_room") ?? "lobby"
  );
  const [draftMode, setDraftMode] = useState(invite.mode ?? "classic");
  const [joined, setJoined] = useState<{
    name: string;
    room: string;
    mode: string;
  } | null>(null);

  // Cycle taglines while sitting on the join screen.
  const [tagIdx, setTagIdx] = useState(() => Math.floor(Math.random() * TAGLINES.length));
  useEffect(() => {
    if (joined) return;
    const t = setInterval(() => setTagIdx((i) => (i + 1) % TAGLINES.length), 3200);
    return () => clearInterval(t);
  }, [joined]);

  const doJoin = () => {
    const name = draftName.trim();
    if (!name) return;
    const room = draftRoom.trim() || "lobby";
    localStorage.setItem("iiad_name", name);
    localStorage.setItem("iiad_room", room);
    setJoined({ name, room, mode: draftMode });
  };

  if (!joined) {
    return (
      <div style={styles.gate}>
        <div className="glass pop-in" style={styles.card}>
          <div style={styles.brand}>
            <span style={styles.brandMark}>🐶</span>
            <div>
              <h1 className="grad-anim" style={styles.title}>is it a dog?</h1>
              <p key={tagIdx} className="pop-in" style={styles.subtitle}>
                {TAGLINES[tagIdx]}
              </p>
            </div>
          </div>

          {getStreak() > 0 && (
            <div style={styles.streakBadge}>
              🔥 {getStreak()}-win streak — don't choke
            </div>
          )}

          {invited && (
            <div style={styles.inviteRibbon}>
              🎉 you got the invite to <strong>#{draftRoom}</strong> — drop a name
              and pull up
            </div>
          )}

          <label style={styles.fieldLabel}>Your name</label>
          <div style={styles.nameRow}>
            <input
              placeholder="whatever you want, really"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doJoin()}
              style={{ ...styles.input, flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              className="lift wiggle"
              style={styles.diceButton}
              title="gimme a random name"
              onClick={() => setDraftName(randomName())}
            >
              🎲
            </button>
          </div>

          <label style={styles.fieldLabel}>Room</label>
          <input
            placeholder="lobby"
            value={draftRoom}
            onChange={(e) => setDraftRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doJoin()}
            style={styles.input}
          />

          <label style={styles.fieldLabel}>Game mode</label>
          <div style={styles.modeGrid}>
            {MODES.map((m) => {
              const active = m.value === draftMode;
              return (
                <button
                  key={m.value}
                  className="lift"
                  onClick={() => setDraftMode(m.value)}
                  style={{
                    ...styles.modeCard,
                    ...(active ? styles.modeCardActive : null),
                  }}
                >
                  <span style={styles.modeIcon}>{m.icon}</span>
                  <span style={styles.modeLabel}>{m.label}</span>
                  <span style={styles.modeBlurb}>{m.blurb}</span>
                </button>
              );
            })}
          </div>
          <small style={styles.hint}>
            first one in the room picks the mode. snooze, lose, etc.
          </small>

          <button
            className={draftName.trim() ? "lift pulse-cta" : undefined}
            style={{
              ...styles.button,
              ...styles.buttonBig,
              ...(draftName.trim() ? null : styles.buttonDisabled),
            }}
            disabled={!draftName.trim()}
            onClick={doJoin}
          >
pull up →
          </button>
        </div>
      </div>
    );
  }

  return <Room name={joined.name} room={joined.room} mode={joined.mode} />;
}

// Server turn length — mirrors TURN_MS in engine.ts. Only used to size the
// draining progress bar; the authoritative deadline is still turnEndsAt.
const TURN_MS = 60_000;

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const msLeft = Math.max(0, endsAt - now);
  const secs = Math.ceil(msLeft / 1000);
  const frac = Math.max(0, Math.min(1, msLeft / TURN_MS));
  const low = secs <= 10;
  return (
    <span style={styles.timerWrap}>
      <span style={styles.timerBarTrack}>
        <span
          style={{
            ...styles.timerBarFill,
            width: `${frac * 100}%`,
            background: low ? "var(--bad)" : "var(--grad)",
          }}
        />
      </span>
      <span style={{ ...styles.timer, ...(low ? styles.timerLow : null) }}>
        ⏱ {secs}s
      </span>
    </span>
  );
}

function Room({ name, room, mode }: { name: string; room: string; mode: string }) {
  const {
    connected,
    you,
    players,
    log,
    game,
    myWord,
    sendChat,
    sendDraw,
    subscribeDraw,
    clearBoard,
    startGame,
    wordChoices,
    chooseWord,
  } = useGameSocket(room, name, mode);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [copied, setCopied] = useState(false);
  const [flexed, setFlexed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [burstKey, setBurstKey] = useState(0);
  const [takeIdx, setTakeIdx] = useState(0);
  const [winConfetti, setWinConfetti] = useState(48);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const prevGuessed = useRef<string[]>([]);

  const phase = game?.phase ?? "lobby";
  const isDrawer = !!game && game.drawerId === you?.id;
  const canDraw = phase === "playing" && isDrawer;
  const inGame = phase === "playing" || phase === "intermission";

  // Live tab title — nudges people back to the tab when it's their turn.
  useEffect(() => {
    document.title = canDraw
      ? "✏️ YOUR TURN — is it a dog?"
      : inGame
      ? "🎨 playing · is it a dog?"
      : "is it a dog? 🐶";
    return () => {
      document.title = "is it a dog? 🐶";
    };
  }, [canDraw, inGame]);

  // Pop a transient toast the moment it becomes your turn to draw.
  useEffect(() => {
    if (canDraw) {
      setToast("🎨 you're up — cook!");
      blip([523, 784], muted); // little "ping!"
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw]);

  // Celebrate correct guesses: a tick for anyone, a full burst + sting + toast
  // when it's YOU who just nailed it.
  useEffect(() => {
    const cur = game?.guessedIds ?? [];
    const prev = prevGuessed.current;
    const fresh = cur.filter((id) => !prev.includes(id));
    prevGuessed.current = cur;
    if (fresh.length === 0) return;
    if (you && fresh.includes(you.id)) {
      setBurstKey((k) => k + 1);
      blip([659, 880, 1175], muted);
      setToast("✅ nailed it! big brain 🧠");
      const t = setTimeout(() => setToast(null), 2400);
      return () => clearTimeout(t);
    } else {
      blip([880], muted); // someone else got it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.guessedIds]);

  // On game end: figure out if you won, update the streak, and play a sting.
  useEffect(() => {
    if (phase !== "ended") return;
    const won = ranked.length > 0 && ranked[0].id === you?.id;
    const streak = bumpStreak(won);
    if (won) {
      setWinConfetti(Math.min(48 + streak * 16, 160)); // bigger party per streak
      blip([523, 659, 784, 1047], muted); // ascending fanfare
      setToast(streak > 1 ? `🏆 dub! ${streak} in a row 🔥` : pick(WIN_LINES));
    } else {
      setWinConfetti(48);
      blip([330, 247], muted); // sad trombone-ish
      setToast(pick(LOSS_LINES));
    }
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Word line: the drawer sees the real word; guessers see one tile per
  // letter, with letters filling in as the server reveals hints over the turn
  // ("_" → blank tile). Falls back to wordLength tiles before any hint lands.
  const wordLetters = isDrawer
    ? (myWord ?? "").split("")
    : game?.hint
      ? game.hint.split("").map((ch) => (ch === "_" ? "" : ch))
      : Array.from({ length: game?.wordLength ?? 0 }, () => "");

  // Players sorted by score for the scoreboard.
  const ranked = [...players].sort(
    (a, b) => (game?.scores[b.id] ?? 0) - (game?.scores[a.id] ?? 0)
  );

  const modeMeta = MODES.find((m) => m.value === mode);
  const hasAI = players.some((p) => isAI(p.id));

  // Cycle the bot's hot-takes while a game with an AI is in progress.
  useEffect(() => {
    if (!hasAI || !inGame) return;
    const t = setInterval(() => setTakeIdx((i) => (i + 1) % HOT_TAKES.length), 4200);
    return () => clearInterval(t);
  }, [hasAI, inGame]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      if (!next) blip([659], false); // little confirmation chirp when unmuting
      return next;
    });
  };

  const handleInvite = async () => {
    const ok = await copyText(inviteLink(room, mode));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // Wordle-style flex text: a copy-pasteable recap of how you stacked up. This
  // is the share loop — text + a link is what actually spreads.
  const flexText = () => {
    const place = you ? ranked.findIndex((p) => p.id === you.id) + 1 : 0;
    const beatAI =
      ranked.some((p) => isAI(p.id)) &&
      you != null &&
      (game?.scores[you.id] ?? 0) >
        Math.max(...ranked.filter((p) => isAI(p.id)).map((p) => game?.scores[p.id] ?? 0));
    const streak = getStreak();

    // Wordle-style visual grid: each player is a row of blocks sized to their
    // score (fixed-width emoji, so it stays aligned when pasted anywhere).
    // 🟪 = you, 🤖 = the bot, ⬜ = everyone else. This is the shareable hook.
    const top = Math.max(1, ...ranked.map((p) => game?.scores[p.id] ?? 0));
    const medals = ["🥇", "🥈", "🥉"];
    const rows = ranked.slice(0, 4).map((p, i) => {
      const score = game?.scores[p.id] ?? 0;
      const filled = Math.max(1, Math.round((score / top) * 8));
      const block = p.id === you?.id ? "🟪" : isAI(p.id) ? "🤖" : "⬜";
      return `${medals[i] ?? "▪️"} ${block.repeat(filled)} ${score}`;
    });

    const brags = [
      beatAI ? "cooked the bot too 🤖💥 no cap" : null,
      streak > 1 ? `🔥 ${streak}-win streak` : null,
    ].filter(Boolean);

    return [
      `is it a dog? 🐶 · ${modeMeta?.label ?? mode}`,
      `i came #${place || "?"}/${ranked.length} and that's on periodt`,
      "",
      ...rows,
      ...(brags.length ? ["", ...brags] : []),
      "",
      `pull up: ${inviteLink(room, mode)}`,
    ].join("\n");
  };

  const handleFlex = async () => {
    const ok = await copyText(flexText());
    if (ok) {
      setFlexed(true);
      setTimeout(() => setFlexed(false), 1800);
    }
  };

  return (
    <div className="app-layout" style={styles.layout}>
      <Confetti go={phase === "ended"} count={winConfetti} />
      {burstKey > 0 && <Confetti key={burstKey} go count={28} />}
      {toast && (
        <div className="toast-in" role="status" aria-live="polite" style={styles.toast}>
          {toast}
        </div>
      )}
      {/* ---- Sidebar: roster + scores ---- */}
      <aside className="glass" style={styles.sidebar}>
        <div style={styles.roomHead}>
          <span style={styles.roomMark}>🐶</span>
          <div style={{ minWidth: 0 }}>
            <div className="grad-anim" style={styles.roomName}>#{room}</div>
            <div style={styles.roomMode}>
              {modeMeta?.icon} {modeMeta?.label ?? mode}
            </div>
          </div>
        </div>

        <div
          style={{
            ...styles.statusPill,
            ...(connected ? styles.statusOk : styles.statusBad),
          }}
        >
          <span style={styles.statusDot} /> {connected ? "we're so back" : "hang on…"}
        </div>

        <button
          className="lift"
          style={{ ...styles.inviteButton, ...(copied ? styles.inviteButtonOk : null) }}
          onClick={handleInvite}
        >
          {copied ? "✅ copied, go spam it" : "🔗 invite the squad"}
        </button>

        <button className="lift" style={styles.muteButton} onClick={toggleMute}>
          {muted ? "🔇 sound off" : "🔊 sound on"}
        </button>

        <div style={styles.sectionLabel}>Scoreboard</div>
        <ul style={styles.scoreList}>
          {ranked.map((p, i) => {
            const me = p.id === you?.id;
            const drawer = game?.drawerId === p.id;
            const guessed = game?.guessedIds.includes(p.id);
            return (
              <li
                key={p.id}
                style={{
                  ...styles.scoreRow,
                  ...(me ? styles.scoreRowMe : null),
                  ...(drawer ? styles.scoreRowDrawer : null),
                }}
              >
                <span style={styles.rank}>{i + 1}</span>
                <span style={styles.playerName}>
                  {isAI(p.id) ? <span style={styles.aiBadge}>AI</span> : null}
                  <span style={styles.nameText}>{p.name}</span>
                  {me ? <span style={styles.youTag}>you</span> : null}
                  {drawer ? <span title="drawing">✏️</span> : null}
                  {guessed ? <span title="guessed">✅</span> : null}
                </span>
                <strong style={styles.scoreNum}>{game?.scores[p.id] ?? 0}</strong>
              </li>
            );
          })}
          {ranked.length === 0 && (
            <li style={styles.emptyRoster}>nobody here but us 🦗</li>
          )}
        </ul>
      </aside>

      {/* ---- Canvas pane ---- */}
      <section className="pane-canvas" style={styles.canvasPane}>
        <div className="glass" style={styles.banner}>
          {phase === "lobby" && (
            <>
              <span style={styles.bannerText}>
                lowkey waiting · {players.length} pulled up
              </span>
              <button className="lift pulse-cta" style={{ ...styles.button, marginLeft: "auto" }} onClick={startGame}>
                send it
              </button>
            </>
          )}
          {phase === "ended" && (
            <>
              <span className="pop-in" style={styles.bannerText}>🏁 and that's on periodt</span>
              <button
                className="lift"
                style={{ ...styles.ghostButton, marginLeft: "auto" }}
                onClick={handleFlex}
              >
                {flexed ? "✅ copied, go flex" : "📋 copy dub"}
              </button>
              <button
                className="lift"
                style={styles.xButton}
                onClick={() => shareToX(flexText())}
              >
                𝕏 post it
              </button>
              <button className="lift pulse-cta" style={styles.button} onClick={startGame}>
                run it back
              </button>
            </>
          )}
          {phase === "choosing" && (
            <>
              <span style={styles.turnPill}>
                {(game?.totalRounds ?? 1) > 1
                  ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1}`
                  : "Choosing"}
              </span>
              {isDrawer && wordChoices ? (
                <span style={styles.wordZone}>
                  <span style={styles.wordVerb}>pick one</span>
                  <span style={styles.tiles}>
                    {wordChoices.map((w) => (
                      <button
                        key={w}
                        className="lift"
                        style={styles.button}
                        onClick={() => chooseWord(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </span>
                </span>
              ) : (
                <span style={styles.wordZone}>
                  <span style={styles.wordVerb}>
                    {(game?.drawerId ? playerName(players, game.drawerId) : "someone")} is
                    picking a word…
                  </span>
                </span>
              )}
            </>
          )}
          {inGame && (
            <>
              <span style={styles.turnPill}>
                {(game?.totalRounds ?? 1) > 1
                  ? `Round ${game?.round ?? 1}/${game?.totalRounds ?? 1} · Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`
                  : `Turn ${(game?.turnIndex ?? 0) + 1}/${game?.totalTurns ?? 0}`}
              </span>
              <span style={styles.wordZone}>
                <span style={styles.wordVerb}>{isDrawer ? "cook this" : "guess fr"}</span>
                <span style={styles.tiles}>
                  {wordLetters.map((ch, i) => (
                    <span key={i} style={styles.tile}>
                      {ch}
                    </span>
                  ))}
                </span>
              </span>
              <Countdown endsAt={game?.turnEndsAt ?? null} />
            </>
          )}
        </div>

        <div className="glass" style={styles.toolbar}>
          {COLORS.map((c) => (
            <button
              key={c}
              disabled={!canDraw}
              onClick={() => setColor(c)}
              style={{
                ...styles.swatch,
                background: c,
                cursor: canDraw ? "pointer" : "default",
                opacity: canDraw ? 1 : 0.35,
                boxShadow:
                  c === color ? "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)" : "none",
                border: c === "#ffffff" ? "1px solid #44495a" : "none",
              }}
              aria-label={`color ${c}`}
            />
          ))}
          <div style={styles.toolDivider} />
          <input
            type="range"
            min={1}
            max={32}
            value={width}
            disabled={!canDraw}
            onChange={(e) => setWidth(Number(e.target.value))}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={widthDot(width, color, canDraw)} />
          <button
            className="lift"
            style={{ ...styles.ghostButton, marginLeft: "auto" }}
            onClick={() => canvasElRef.current && saveCanvasPng(canvasElRef.current, room)}
            title="save the masterpiece"
          >
            🖼️ save
          </button>
          <button
            className="lift"
            style={styles.ghostButton}
            onClick={clearBoard}
            disabled={!canDraw}
          >
            Clear
          </button>
        </div>

        <div className="canvas-wrap" style={styles.canvasWrap}>
          <DrawingCanvas
            sendDraw={sendDraw}
            subscribeDraw={subscribeDraw}
            color={color}
            width={width}
            canDraw={canDraw}
            onCanvas={(el) => (canvasElRef.current = el)}
          />
          {!canDraw && inGame && (
            <div style={styles.canvasHintBadge}>
              {isAI(game?.drawerId)
                ? "🤖 the bot is cooking"
                : `${playerName(players, game?.drawerId ?? "")} is cooking 👨‍🍳`}
              <Dots />
            </div>
          )}
          {hasAI && inGame && (
            <div key={takeIdx} className="pop-in" style={styles.hotTake}>
              🤖 {HOT_TAKES[takeIdx]}
            </div>
          )}
        </div>
      </section>

      {/* ---- Chat ---- */}
      <main className="glass" style={styles.main}>
        <div style={styles.sectionLabel}>the group chat</div>
        <div style={styles.chatLog}>
          {log.map((line, i) =>
            line.kind === "system" ? (
              <div key={i} style={styles.system}>
                {line.text}
              </div>
            ) : (
              <div key={i} style={styles.chatLine}>
                <span
                  style={{
                    ...styles.chatFrom,
                    ...(isAI(line.from?.id) ? styles.chatFromAI : null),
                  }}
                >
                  {isAI(line.from?.id) ? "🤖 " : ""}
                  {line.from?.name}
                </span>
                <span style={styles.chatText}>{line.text}</span>
              </div>
            )
          )}
          {log.length === 0 && <div style={styles.system}>crickets… break the ice bestie 👀</div>}
        </div>
        <div style={styles.reactRow}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="lift"
              style={styles.reactBtn}
              onClick={() => sendChat(emoji)}
              disabled={canDraw}
              title={`react ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <form
          style={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) {
              sendChat(t);
              setText("");
            }
          }}
        >
          <input
            style={{ ...styles.input, flex: 1, margin: 0 }}
            placeholder={
              canDraw
                ? "eyes on the canvas, picasso ✋"
                : inGame
                ? "guess it bestie…"
                : "say something fr"
            }
            disabled={canDraw}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="lift" style={styles.button} type="submit" disabled={canDraw}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

function playerName(players: { id: string; name: string }[], id: string) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}

const styles: Record<string, React.CSSProperties> = {
  // ---- Join gate ----
  gate: {
    minHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    border: "1px solid var(--line)",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  },
  brand: { display: "flex", alignItems: "center", gap: 14, marginBottom: 22 },
  brandMark: {
    fontSize: 42,
    lineHeight: 1,
    filter: "drop-shadow(0 4px 14px rgba(168,85,247,0.6))",
    animation: "floaty 3.5s ease-in-out infinite",
  },
  title: {
    margin: 0,
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    background: "var(--grad)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: { margin: "2px 0 0", color: "var(--muted)", fontSize: 13 },
  fieldLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    margin: "14px 0 6px",
  },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  modeCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--line)",
    background: "var(--panel-2)",
    color: "var(--text)",
    cursor: "pointer",
    textAlign: "left",
    transition: "all .12s ease",
  },
  modeCardActive: {
    borderColor: "var(--accent)",
    background: "linear-gradient(180deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  modeIcon: { fontSize: 20 },
  modeLabel: { fontWeight: 600, fontSize: 14 },
  modeBlurb: { fontSize: 11, color: "var(--muted)" },
  hint: { display: "block", color: "var(--muted)", fontSize: 12, margin: "12px 0 4px" },
  inviteRibbon: {
    margin: "16px 0 4px",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    background: "linear-gradient(180deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    border: "1px solid var(--accent)",
    color: "var(--text)",
  },
  inviteButton: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px dashed var(--accent)",
    background: "rgba(99,102,241,0.08)",
    color: "var(--accent-2)",
    transition: "all .12s ease",
  },
  inviteButtonOk: {
    border: "1px solid var(--good)",
    background: "rgba(34,197,94,0.12)",
    color: "#4ade80",
  },
  streakBadge: {
    margin: "16px 0 0",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    background: "rgba(251,146,60,0.14)",
    border: "1px solid rgba(251,146,60,0.5)",
    color: "#fdba74",
  },
  muteButton: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--panel-2)",
    color: "var(--text)",
  },

  // ---- Layout ----
  layout: {
    display: "grid",
    gridTemplateColumns: "240px minmax(0,1fr) 320px",
    height: "100vh",
    gap: 1,
    background: "var(--line)",
  },
  sidebar: {
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflow: "hidden",
  },
  roomHead: { display: "flex", alignItems: "center", gap: 10 },
  roomMark: { fontSize: 26 },
  roomName: {
    fontFamily: "'Fredoka', sans-serif",
    fontSize: 20,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    background: "var(--grad)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  roomMode: { fontSize: 12, color: "var(--muted)" },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 10px",
    borderRadius: 999,
  },
  statusOk: { background: "rgba(34,197,94,0.12)", color: "#4ade80" },
  statusBad: { background: "rgba(239,68,68,0.12)", color: "#f87171" },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "currentColor",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  scoreList: { listStyle: "none", padding: 0, margin: 0, overflowY: "auto", flex: 1 },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    marginBottom: 4,
    background: "var(--panel-2)",
  },
  scoreRowMe: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  scoreRowDrawer: {
    background: "linear-gradient(180deg, rgba(99,102,241,0.16), rgba(99,102,241,0.04))",
  },
  rank: {
    width: 18,
    textAlign: "center",
    color: "var(--muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  playerName: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    flex: 1,
    fontSize: 14,
  },
  nameText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  aiBadge: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.05em",
    padding: "2px 5px",
    borderRadius: 6,
    background: "rgba(129,140,248,0.2)",
    color: "var(--accent-2)",
  },
  youTag: {
    fontSize: 10,
    color: "var(--muted)",
    background: "var(--line)",
    padding: "1px 6px",
    borderRadius: 6,
  },
  scoreNum: { fontVariantNumeric: "tabular-nums", fontSize: 15 },
  emptyRoster: { color: "var(--muted)", fontSize: 13, padding: 8 },

  // ---- Canvas pane ----
  canvasPane: {
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    border: "1px solid var(--line)",
    borderRadius: 12,
    minHeight: 30,
  },
  bannerText: { fontSize: 15, fontWeight: 600 },
  turnPill: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--accent-2)",
    background: "rgba(99,102,241,0.14)",
    padding: "4px 10px",
    borderRadius: 999,
  },
  wordZone: { display: "flex", alignItems: "center", gap: 10, margin: "0 auto" },
  wordVerb: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--muted)",
  },
  tiles: { display: "flex", gap: 5 },
  tile: {
    minWidth: 22,
    height: 30,
    padding: "0 4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    background: "var(--panel-2)",
    borderBottom: "2px solid var(--accent)",
    borderRadius: 6,
    textTransform: "uppercase",
  },
  timerWrap: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  timerBarTrack: {
    width: 70,
    height: 6,
    borderRadius: 999,
    background: "var(--panel-2)",
    overflow: "hidden",
  },
  timerBarFill: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    transition: "width .12s linear",
  },
  timer: {
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: "var(--muted)",
    minWidth: 40,
    textAlign: "right",
  },
  timerLow: { color: "#f87171" },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--line)",
    borderRadius: 12,
    flexWrap: "wrap",
  },
  swatch: { width: 26, height: 26, borderRadius: "50%", padding: 0 },
  toolDivider: { width: 1, height: 22, background: "var(--line)" },
  canvasWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  },
  hotTake: {
    position: "absolute",
    bottom: 12,
    left: 12,
    maxWidth: "70%",
    background: "rgba(15,17,23,0.82)",
    color: "#fbbf24",
    fontSize: 13,
    fontWeight: 600,
    fontStyle: "italic",
    padding: "7px 13px",
    borderRadius: 14,
    border: "1px solid rgba(251,191,36,0.35)",
    backdropFilter: "blur(6px)",
    pointerEvents: "none",
  },
  canvasHintBadge: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(15,17,23,0.78)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    backdropFilter: "blur(6px)",
    pointerEvents: "none",
  },

  // ---- Chat ----
  main: {
    display: "flex",
    flexDirection: "column",
    padding: 18,
    gap: 12,
    minWidth: 0,
  },
  chatLog: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingRight: 4,
  },
  chatLine: { fontSize: 14, lineHeight: 1.4 },
  chatFrom: { fontWeight: 700, marginRight: 6, color: "var(--accent-2)" },
  chatFromAI: { color: "#fbbf24" },
  chatText: { color: "var(--text)", wordBreak: "break-word" },
  system: { color: "var(--muted)", fontStyle: "italic", fontSize: 13 },
  toast: {
    position: "fixed",
    top: 18,
    left: "50%",
    zIndex: 10000,
    padding: "12px 22px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 15,
    color: "white",
    background: "var(--grad)",
    boxShadow: "0 10px 30px rgba(168,85,247,0.5)",
    whiteSpace: "nowrap",
  },
  inputRow: { display: "flex", gap: 8 },
  reactRow: { display: "flex", gap: 6, marginBottom: 8 },
  reactBtn: {
    flex: 1,
    padding: "6px 0",
    fontSize: 17,
    cursor: "pointer",
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "var(--panel-2)",
  },

  // ---- Shared controls ----
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    color: "var(--text)",
    outline: "none",
  },
  button: {
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    borderRadius: 10,
    background: "var(--grad)",
    color: "white",
    boxShadow: "0 6px 18px rgba(168,85,247,0.35)",
  },
  buttonBig: { width: "100%", marginTop: 18, padding: "13px 16px", fontSize: 15 },
  nameRow: { display: "flex", gap: 8, alignItems: "stretch" },
  diceButton: {
    width: 46,
    fontSize: 20,
    cursor: "pointer",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "var(--panel-2)",
    flexShrink: 0,
  },
  xButton: {
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    borderRadius: 10,
    background: "#111111",
    color: "white",
  },
  buttonDisabled: { opacity: 0.45, cursor: "not-allowed" },
  ghostButton: {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "transparent",
    color: "var(--text)",
  },
};
