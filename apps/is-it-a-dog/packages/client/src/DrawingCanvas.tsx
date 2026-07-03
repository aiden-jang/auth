import { useEffect, useRef } from "react";
import type { DrawOp, Point } from "@is-it-a-dog/shared";

interface Props {
  sendDraw: (op: DrawOp) => void;
  subscribeDraw: (fn: (op: DrawOp | { kind: "reset" }) => void) => () => void;
  color: string;
  width: number;
  canDraw: boolean; // only the current drawer may paint
  // Hands the underlying <canvas> element up so the parent can snapshot it.
  onCanvas?: (el: HTMLCanvasElement | null) => void;
}

// Per-stroke render state, keyed by strokeId, so interleaved remote strokes
// each remember their own last point + style during replay.
interface StrokeState {
  last: Point;
  color: string;
  width: number;
}

export function DrawingCanvas({
  sendDraw,
  subscribeDraw,
  color,
  width,
  canDraw,
  onCanvas,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokes = useRef<Map<string, StrokeState>>(new Map());

  // Latest brush settings, read at pointer-down time without re-subscribing.
  const brush = useRef({ color, width });
  brush.current = { color, width };

  // Apply one op to the canvas. Shared by local drawing and remote replay,
  // so the drawer and watchers run identical rendering logic.
  function applyOp(op: DrawOp | { kind: "reset" }) {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    switch (op.kind) {
      case "reset":
      case "clear":
        ctx.clearRect(0, 0, W, H);
        strokes.current.clear();
        break;
      case "start":
        strokes.current.set(op.strokeId, {
          last: op.point,
          color: op.color,
          width: op.width,
        });
        break;
      case "move": {
        const s = strokes.current.get(op.strokeId);
        if (!s) return;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(s.last.x * W, s.last.y * H);
        for (const p of op.points) {
          ctx.lineTo(p.x * W, p.y * H);
        }
        ctx.stroke();
        s.last = op.points[op.points.length - 1] ?? s.last;
        break;
      }
      case "end":
        strokes.current.delete(op.strokeId);
        break;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Match the drawing buffer to the displayed size so coords are 1:1.
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctxRef.current = canvas.getContext("2d");
    onCanvas?.(canvas);

    const unsub = subscribeDraw(applyOp);
    return () => {
      unsub();
      onCanvas?.(null);
    };
  }, [subscribeDraw]);

  // ----- Local drawing -----
  const drawing = useRef(false);
  const strokeId = useRef<string | null>(null);
  const buffer = useRef<Point[]>([]);
  const rafPending = useRef(false);

  function toNorm(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  // Coalesce buffered points into one "move" op per animation frame. This
  // caps message rate (~60/s) instead of firing on every pointermove event.
  function flush() {
    rafPending.current = false;
    if (!strokeId.current || buffer.current.length === 0) return;
    const points = buffer.current;
    buffer.current = [];
    const op: DrawOp = { kind: "move", strokeId: strokeId.current, points };
    applyOp(op); // local immediate render
    sendDraw(op); // relay to others
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canDraw) return; // not your turn
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokeId.current = Math.random().toString(36).slice(2, 10);
    const point = toNorm(e);
    const op: DrawOp = {
      kind: "start",
      strokeId: strokeId.current,
      color: brush.current.color,
      width: brush.current.width,
      point,
    };
    applyOp(op);
    sendDraw(op);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    buffer.current.push(toNorm(e));
    if (!rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(flush);
    }
  }

  function onPointerUp() {
    if (!drawing.current) return;
    flush(); // emit any trailing buffered points
    drawing.current = false;
    if (strokeId.current) {
      const op: DrawOp = { kind: "end", strokeId: strokeId.current };
      applyOp(op);
      sendDraw(op);
      strokeId.current = null;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        width: "100%",
        height: "100%",
        border: "1px solid #ccc",
        borderRadius: 4,
        touchAction: "none",
        cursor: canDraw ? "crosshair" : "not-allowed",
        background: "white",
      }}
    />
  );
}
