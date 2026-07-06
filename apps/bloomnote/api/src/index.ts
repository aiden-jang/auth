import { Hono } from 'hono';
import { getSessionUser } from '@aidenjang/auth-client';
import { harden } from '@aidenjang/http';
import type { Env } from './env.js';
import { claimGardens, createGarden, listMine, readGarden, recordReceived } from './gardens.js';
import { buildPrompt, checkBudget, generateGarden, validateBody } from './designGarden.js';

const app = new Hono<{ Bindings: Env }>();

// Which auth service to validate the session against. In local `wrangler dev` the auth Worker
// runs on :34100, so a request hitting localhost validates there rather than production —
// otherwise a local login is checked against the live auth service and never recognized.
function authBase(req: Request, env: Env): string {
  const host = new URL(req.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' ? 'http://localhost:34100' : env.AUTH_URL;
}

// Security headers on every response + a same-origin CSRF guard on state-changing requests.
app.use('*', harden());

app.get('/health', (c) => c.json({ status: 'ok', service: 'bloomnote' }));

// Who is the caller? Same-origin endpoint the web polls so the browser never talks to the
// auth service cross-origin. Returns { user: null } when signed out — bloomnote is anonymous-
// first, so accounts are optional and this is never a hard 401.
app.get('/api/me', async (c) => {
  const user = await getSessionUser(c.req.raw, authBase(c.req.raw, c.env));
  return c.json({ user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null });
});

// Read a garden by short id. Immutable once created, so it's aggressively cacheable.
app.get('/api/garden', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.json({ error: 'Missing or malformed id.' }, 400);
  const garden = await readGarden(c.env, id);
  if (garden === null) return c.json({ error: 'Garden not found.' }, 404);
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  return c.json({ garden });
});

// Create a garden, returning its short id. Body is the garden JSON. When the creator is signed
// in, the garden is stamped with their ownerId and added to their Sent list; anonymous still works.
app.post('/api/garden', async (c) => {
  const body = await c.req.json().catch(() => null);
  const user = await getSessionUser(c.req.raw, authBase(c.req.raw, c.env));
  const result = await createGarden(c.env, body, user?.id);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ id: result.id });
});

// Record that the signed-in caller opened someone else's garden (adds it to their Received list).
app.post('/api/garden/:id/receive', async (c) => {
  const user = await getSessionUser(c.req.raw, authBase(c.req.raw, c.env));
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  await recordReceived(c.env, user.id, c.req.param('id'));
  return c.json({ ok: true });
});

// The signed-in user's gardens (Sent + Received), read server-side so it's the same on any device.
app.get('/api/mine', async (c) => {
  const user = await getSessionUser(c.req.raw, authBase(c.req.raw, c.env));
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  return c.json(await listMine(c.env, user.id));
});

// First-login claim: adopt anonymous on-device gardens (their ids) into the account.
app.post('/api/mine/claim', async (c) => {
  const user = await getSessionUser(c.req.raw, authBase(c.req.raw, c.env));
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
  return c.json({ claimed: await claimGardens(c.env, user.id, ids) });
});

// Generate a garden from a note (Gemini via REST). Streams SSE (start/thinking/complete/error)
// to match the existing client. Rate-limited + globally capped to protect the Gemini budget.
app.post('/api/design-garden', async (c) => {
  if (!c.env.GEMINI_API_KEY) return c.json({ error: 'Garden generation is not configured yet.' }, 503);
  const parsed = validateBody(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const ip =
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const budget = await checkBudget(c.env, ip);
  if (!budget.ok) return c.json({ error: budget.message }, budget.status, { 'Retry-After': String(budget.retryAfter) });

  const apiKey = c.env.GEMINI_API_KEY;
  const userPrompt = buildPrompt(parsed.body);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown): void =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        send('start', { ok: true });
        send('thinking', {});
        const garden = await generateGarden(apiKey, userPrompt);
        send('complete', { garden });
      } catch (err) {
        send('error', { error: err instanceof Error ? err.message : 'Generation failed.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  });
});

// Everything that isn't the API is the web SPA: real files, or index.html for client routes
// (/g/:id, /r/:id, /mine). run_worker_first routes it all through here.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
