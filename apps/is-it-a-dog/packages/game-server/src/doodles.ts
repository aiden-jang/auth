import type { DrawOp, Point } from "shared";

// A tiny library of hand-coded vector doodles, one per word. Each doodle is a
// list of STROKES (so AIDrawerMode can reveal them one at a time, making the
// AI look like it's drawing). Coordinates are normalized 0..1 to match the
// client's resolution-independent canvas.
//
// Why a curated library instead of a model? It demos legibly, costs nothing,
// and keeps the game loop testable. A real generator can slot in behind
// AIDrawerMode's injected `requestDrawing` callback later, same as the vision
// provider does for the guesser.

let idCounter = 0;
const nextId = () => `ai-draw-${Date.now()}-${idCounter++}`;

// Build one stroke (start + move + end) from a polyline of points.
function stroke(points: Point[], color = "#222", width = 4): DrawOp[] {
  if (points.length === 0) return [];
  const strokeId = nextId();
  const [first, ...rest] = points;
  const ops: DrawOp[] = [{ kind: "start", strokeId, color, width, point: first }];
  if (rest.length) ops.push({ kind: "move", strokeId, points: rest });
  ops.push({ kind: "end", strokeId });
  return ops;
}

function circle(cx: number, cy: number, r: number, color = "#222", width = 4, seg = 28): DrawOp[] {
  const pts: Point[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return stroke(pts, color, width);
}

function starPath(cx: number, cy: number, outer: number, inner: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; // 36° steps, start at top
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// Each entry returns a fresh list of strokes (fresh stroke ids per turn).
export const DOODLES: Record<string, () => DrawOp[][]> = {
  house: () => [
    stroke([
      { x: 0.35, y: 0.6 }, { x: 0.65, y: 0.6 }, { x: 0.65, y: 0.85 },
      { x: 0.35, y: 0.85 }, { x: 0.35, y: 0.6 },
    ]),
    stroke([{ x: 0.3, y: 0.6 }, { x: 0.5, y: 0.42 }, { x: 0.7, y: 0.6 }]),
    stroke([
      { x: 0.46, y: 0.85 }, { x: 0.46, y: 0.72 },
      { x: 0.54, y: 0.72 }, { x: 0.54, y: 0.85 },
    ]),
  ],
  tree: () => [
    stroke([
      { x: 0.47, y: 0.85 }, { x: 0.47, y: 0.62 },
      { x: 0.53, y: 0.62 }, { x: 0.53, y: 0.85 },
    ]),
    circle(0.5, 0.44, 0.16),
  ],
  star: () => [stroke([...starPath(0.5, 0.5, 0.26, 0.11)])],
  smiley: () => [
    circle(0.5, 0.5, 0.28),
    circle(0.41, 0.43, 0.025),
    circle(0.59, 0.43, 0.025),
    stroke([
      { x: 0.38, y: 0.58 }, { x: 0.44, y: 0.66 },
      { x: 0.56, y: 0.66 }, { x: 0.62, y: 0.58 },
    ]),
  ],
  cat: () => [
    circle(0.5, 0.55, 0.22),
    stroke([{ x: 0.34, y: 0.4 }, { x: 0.3, y: 0.22 }, { x: 0.46, y: 0.36 }]),
    stroke([{ x: 0.66, y: 0.4 }, { x: 0.7, y: 0.22 }, { x: 0.54, y: 0.36 }]),
    stroke([{ x: 0.44, y: 0.52 }, { x: 0.46, y: 0.52 }]),
    stroke([{ x: 0.54, y: 0.52 }, { x: 0.56, y: 0.52 }]),
    stroke([{ x: 0.3, y: 0.6 }, { x: 0.18, y: 0.57 }]),
    stroke([{ x: 0.3, y: 0.63 }, { x: 0.18, y: 0.64 }]),
    stroke([{ x: 0.7, y: 0.6 }, { x: 0.82, y: 0.57 }]),
    stroke([{ x: 0.7, y: 0.63 }, { x: 0.82, y: 0.64 }]),
  ],
};

export const DOODLE_WORDS = Object.keys(DOODLES);
