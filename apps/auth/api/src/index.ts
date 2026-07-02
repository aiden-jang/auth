import { Hono } from 'hono';
import type { Env } from './env.js';

// Shared identity service. Every app validates its session against this Worker.
// Endpoints (register/login/logout/me, reset, verify) are added in the following steps.
const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

export default app;
