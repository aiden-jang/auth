import { Hono } from 'hono';
import { getSessionUser } from '@aidenjang/auth-client';
import type { Env } from './env.js';
import { claimGardens, createGarden, listMine, readGarden, recordReceived } from './gardens.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'bloomnote' }));

// Who is the caller? Same-origin endpoint the web polls so the browser never talks to the
// auth service cross-origin. Returns { user: null } when signed out — bloomnote is anonymous-
// first, so accounts are optional and this is never a hard 401.
app.get('/api/me', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
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
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
  const result = await createGarden(c.env, body, user?.id);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ id: result.id });
});

// Record that the signed-in caller opened someone else's garden (adds it to their Received list).
app.post('/api/garden/:id/receive', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  await recordReceived(c.env, user.id, c.req.param('id'));
  return c.json({ ok: true });
});

// The signed-in user's gardens (Sent + Received), read server-side so it's the same on any device.
app.get('/api/mine', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  return c.json(await listMine(c.env, user.id));
});

// First-login claim: adopt anonymous on-device gardens (their ids) into the account.
app.post('/api/mine/claim', async (c) => {
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
  return c.json({ claimed: await claimGardens(c.env, user.id, ids) });
});

// Everything that isn't the API is the web SPA: real files, or index.html for client routes
// (/g/:id, /r/:id, /mine). run_worker_first routes it all through here.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
