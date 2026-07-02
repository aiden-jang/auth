import { createCanvas } from "@napi-rs/canvas";
import type { DrawOp, Point } from "shared";

const WIDTH = 800;
const HEIGHT = 600;

// Replay a stroke-op log onto a headless canvas and return a PNG buffer.
// This mirrors the client's applyOp so the AI literally sees what humans see.
export function renderToPng(ops: DrawOp[]): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // White background (the model expects a normal drawing surface).
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Per-stroke state, keyed by strokeId, exactly like the browser.
  const strokes = new Map<string, { last: Point; color: string; width: number }>();

  for (const op of ops) {
    switch (op.kind) {
      case "clear":
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        strokes.clear();
        break;
      case "start":
        strokes.set(op.strokeId, {
          last: op.point,
          color: op.color,
          width: op.width,
        });
        break;
      case "move": {
        const s = strokes.get(op.strokeId);
        if (!s) break;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.last.x * WIDTH, s.last.y * HEIGHT);
        for (const p of op.points) ctx.lineTo(p.x * WIDTH, p.y * HEIGHT);
        ctx.stroke();
        s.last = op.points[op.points.length - 1] ?? s.last;
        break;
      }
      case "end":
        strokes.delete(op.strokeId);
        break;
    }
  }

  return canvas.toBuffer("image/png");
}
