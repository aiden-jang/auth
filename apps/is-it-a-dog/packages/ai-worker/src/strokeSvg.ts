import type { DrawOp, Point } from '@is-it-a-dog/shared';

// Pure stroke-log → SVG (no WASM/canvas), so it runs and unit-tests anywhere. The rasterizer
// (strokeRender.ts) imports this and turns the SVG into a PNG for the vision providers.

export const WIDTH = 800;
export const HEIGHT = 600;

// Strokes carry client-supplied colors; sanitize before splicing into SVG so a crafted color
// string can't inject markup. Allow hex or a plain css color name, else black.
function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-zA-Z]{1,20}$/.test(c) ? c : '#000000';
}
function pts(points: Point[]): string {
  return points.map((p) => `${(p.x * WIDTH).toFixed(1)},${(p.y * HEIGHT).toFixed(1)}`).join(' ');
}

export function opsToSvg(ops: DrawOp[]): string {
  let strokes = new Map<string, { points: Point[]; color: string; width: number }>();
  let lines: string[] = [];
  const flush = (s: { points: Point[]; color: string; width: number }): void => {
    if (s.points.length === 0) return;
    lines.push(
      `<polyline points="${pts(s.points)}" fill="none" stroke="${safeColor(s.color)}" ` +
        `stroke-width="${Math.max(1, Math.min(80, s.width))}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  };
  for (const op of ops) {
    if (op.kind === 'clear') {
      strokes = new Map();
      lines = []; // clear wipes the canvas — discard everything drawn so far
    } else if (op.kind === 'start') {
      strokes.set(op.strokeId, { points: [op.point], color: op.color, width: op.width });
    } else if (op.kind === 'move') {
      const s = strokes.get(op.strokeId);
      if (s) s.points.push(...op.points);
    } else if (op.kind === 'end') {
      const s = strokes.get(op.strokeId);
      if (s) flush(s);
      strokes.delete(op.strokeId);
    }
  }
  for (const s of strokes.values()) flush(s); // strokes still in progress (no end yet)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>${lines.join('')}</svg>`
  );
}
