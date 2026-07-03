import { initWasm, Resvg } from '@resvg/resvg-wasm';
// wrangler bundles the .wasm as a WebAssembly.Module we hand to initWasm() once.
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import type { DrawOp } from '@is-it-a-dog/shared';
import { opsToSvg, WIDTH } from './strokeSvg.ts';

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(resvgWasm);
  return wasmReady;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Rasterize the stroke log to a base64 PNG for the vision providers (SVG built in strokeSvg.ts). */
export async function opsToPngBase64(ops: DrawOp[]): Promise<string> {
  await ensureWasm();
  const resvg = new Resvg(opsToSvg(ops), { fitTo: { mode: 'width', value: WIDTH } });
  return toBase64(resvg.render().asPng());
}
