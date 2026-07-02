import { Hono } from 'hono';

// Shared identity service. Every app validates its session against this Worker.
// Endpoints (register/login/logout/me, reset, verify) and the D1 identity store
// are added in the following steps; this is the skeleton.
const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

export default app;
