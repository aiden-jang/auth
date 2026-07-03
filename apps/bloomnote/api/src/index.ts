import { Hono } from 'hono';
import { getSessionUser } from '@aidenjang/auth-client';
import type { Env } from './env.js';
import { createGarden, readGarden } from './gardens.js';

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

// Create a garden, returning its short id. Body is the garden JSON.
app.post('/api/garden', async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await createGarden(c.env, body);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ id: result.id });
});

// Everything that isn't the API is the web SPA: real files, or index.html for client routes
// (/g/:id, /r/:id, /mine). run_worker_first routes it all through here.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
