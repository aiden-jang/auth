import type { DrawOp } from '@is-it-a-dog/shared';
import type { Env } from './env.ts';
import { selectProvider } from './visionProviders.ts';
import { opsToPngBase64 } from './strokeRender.ts';

// The worker only ever sees the pixels (a rasterized PNG of the strokes), never the secret word —
// so it can't cheat. Default provider is the mock (no key, no image needed).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const provider = selectProvider(env);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, provider: provider.name });
    }

    if (url.pathname === '/guess' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { ops?: DrawOp[] } | null;
      const ops = Array.isArray(body?.ops) ? body.ops : [];
      if (ops.length === 0) return Response.json({ guess: '', provider: provider.name });
      try {
        // Only rasterize (and touch the WASM) when a real vision model needs the image.
        const png = provider.name === 'mock' ? '' : await opsToPngBase64(ops);
        return Response.json({ guess: await provider.guess(png), provider: provider.name });
      } catch {
        return Response.json({ guess: '', error: 'vision_failed' }, { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
