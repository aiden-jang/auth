import { Hono } from 'hono';
import type { Env2 } from '../http/context.js';

const app = new Hono<Env2>();

app.get('/.well-known/change-password', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.redirect('/account?password=change', 302);
});

// Password managers use this probe to distinguish a real route from an SPA fallback.
app.get('/.well-known/resource-that-should-not-exist-whose-status-code-should-not-be-200', (c) =>
  c.notFound(),
);

export default app;
