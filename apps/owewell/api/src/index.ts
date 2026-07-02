import { Hono } from 'hono';
import { z } from 'zod';
import { getSessionUser } from '@aidenjang/auth-client';
import type { Env } from './env.js';
import { createDb } from './db/client.js';
import { getOrCreatePerson, type Person } from './people.js';
import {
  GroupError,
  addPlaceholderMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeMember,
  renameGroup,
} from './groups.js';

type Vars = { person: Person };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'owewell' }));

// Everything under /owewell requires a signed-in user (validated against the shared auth
// service), resolved to this app's local person.
app.use('/owewell/*', async (c, next) => {
  const user = await getSessionUser(c.req.raw, c.env.AUTH_URL);
  if (!user) return c.json({ error: 'UNAUTHENTICATED' }, 401);
  c.set('person', await getOrCreatePerson(createDb(c.env), user));
  await next();
});

app.post('/owewell/groups', async (c) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const group = await createGroup(createDb(c.env), c.get('person').id, parsed.data.name);
  return c.json({ group }, 201);
});

app.get('/owewell/groups', async (c) => {
  return c.json({ groups: await listGroups(createDb(c.env), c.get('person').id) });
});

app.get('/owewell/groups/:id', async (c) => {
  return c.json({ group: await getGroup(createDb(c.env), c.get('person').id, c.req.param('id')) });
});

app.patch('/owewell/groups/:id', async (c) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  const group = await renameGroup(createDb(c.env), c.get('person').id, c.req.param('id'), parsed.data.name);
  return c.json({ group });
});

app.delete('/owewell/groups/:id', async (c) => {
  await deleteGroup(createDb(c.env), c.get('person').id, c.req.param('id'));
  return c.json({ ok: true });
});

// Add a member. { name } adds a name-only placeholder. { email } (invite a real account) is
// handled by the invite flow, added in a later step.
const addMemberBody = z.union([
  z.object({ name: z.string().trim().min(1).max(80) }),
  z.object({ email: z.string().email() }),
]);
app.post('/owewell/groups/:id/members', async (c) => {
  const parsed = addMemberBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'ValidationError', issues: parsed.error.flatten() }, 400);
  if ('email' in parsed.data) {
    return c.json({ error: 'USE_INVITE', message: 'Invite real accounts with a link (coming next).' }, 501);
  }
  const member = await addPlaceholderMember(createDb(c.env), c.get('person').id, c.req.param('id'), parsed.data.name);
  return c.json({ member }, 201);
});

app.delete('/owewell/groups/:id/members/:personId', async (c) => {
  await removeMember(createDb(c.env), c.get('person').id, c.req.param('id'), c.req.param('personId'));
  return c.json({ ok: true });
});

app.onError((err, c) => {
  if (err instanceof GroupError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'NOT_OWNER' || err.code === 'CANNOT_REMOVE_OWNER'
          ? 403
          : 409;
    return c.json({ error: err.code, message: err.message }, status);
  }
  console.error('owewell api error', err);
  return c.json({ error: 'INTERNAL' }, 500);
});

export default app;
