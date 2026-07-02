import express from "express";
import type { DrawOp } from "shared";
import { renderToPng } from "./canvasRenderer.ts";
import { selectProvider } from "./visionProviders.ts";

const PORT = Number(process.env.AI_WORKER_PORT ?? 8090);
const provider = selectProvider();
console.log(`[ai-worker] vision provider: ${provider.name}`);

const app = express();
// Stroke logs can get large; allow a generous JSON body.
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name });
});

// POST /guess { ops: DrawOp[] } -> { guess, provider }
// Note: the word is intentionally NOT part of the request. The worker only
// sees the pixels, so it can't cheat.
app.post("/guess", async (req, res) => {
  const ops = (req.body?.ops ?? []) as DrawOp[];
  if (!Array.isArray(ops) || ops.length === 0) {
    return res.json({ guess: "", provider: provider.name });
  }
  try {
    const png = renderToPng(ops);
    const guess = await provider.guess(png.toString("base64"));
    res.json({ guess, provider: provider.name });
  } catch (err) {
    console.error("[ai-worker] guess failed:", (err as Error).message);
    res.status(502).json({ guess: "", error: "vision_failed" });
  }
});

app.listen(PORT, () => console.log(`[ai-worker] listening on :${PORT}`));
