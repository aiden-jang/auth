import { Hono } from 'hono';
import { isSecureRequest } from './auth/cookie.js';
import { cors } from 'hono/cors';
import { DEFAULT_CSP, harden } from './harden.js';
import { onUnhandledError, requestIdFrom } from './requestId.js';
import { authOrigins } from './http/origins.js';
import type { Env2 } from './http/context.js';
import discoveryRoutes from './routes/discovery.js';
import accountRoutes from './routes/account.js';
import disconnectGoogleRoute from './routes/misc.js';
import googleRoutes from './routes/google.js';
import passkeyRoutes from './routes/passkeys.js';
import passwordRoutes from './routes/password.js';
import sessionRoutes from './routes/sessions.js';
import signupRoutes from './routes/signup.js';

export { RateLimiter } from './rateLimiter.js';

/* Bindings, the middleware every route sits behind, and the route groups mounted under it. */

const app = new Hono<Env2>();

// An identity service must never answer with a stack trace: anything unhandled is logged and
// comes back as a generic 500.
app.onError(onUnhandledError);

// Auth accepts configured app origins; Turnstile also needs script, frame, and connection access.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const AUTH_CSP =
  DEFAULT_CSP.replace("script-src 'self'", `script-src 'self' ${TURNSTILE_ORIGIN}`).replace(
    "connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com",
    `connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com ${TURNSTILE_ORIGIN}`,
  ) + `; frame-src ${TURNSTILE_ORIGIN}`;
app.use('*', async (c, next) => {
  const requestId = requestIdFrom(c.req.raw);
  c.set('requestId', requestId);
  await next();
  // On every response: a 200 with a surprising body needs correlating as much as a 500.
  c.header('x-request-id', requestId);
});

app.use('*', (c, next) =>
  harden({
    csrf: false,
    // Safari upgrades loopback assets too; local HTTP has no HTTPS listener.
    csp: isSecureRequest(c) ? AUTH_CSP : AUTH_CSP.replace('; upgrade-insecure-requests', ''),
  })(c, next),
);

// Only /assets: a hashed name cannot change, while index.html keeps its name across deploys.
app.use('*', async (c, next) => {
  await next();
  if (/^\/assets\//.test(c.req.path)) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
});

// Account responses must stay uncacheable, including a refusal from the origin gate.
app.use('/auth/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Pragma', 'no-cache');
});

app.use('/auth/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowed = authOrigins(c.env, c.req.url);
  if (origin && !allowed.has(origin) && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return c.json({ error: 'ORIGIN_NOT_ALLOWED', message: 'That is not allowed from here.' }, 403);
  }
  return cors({
    origin: (candidate) => (allowed.has(candidate) ? candidate : null),
    credentials: true,
  })(c, next);
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

/* One module per concern, so a change to passkeys is not an edit to the same file as password
   reset. Everything above still applies to each group. */
app.route('/', discoveryRoutes);
app.route('/', signupRoutes);
app.route('/', googleRoutes);
app.route('/', passwordRoutes);
app.route('/', passkeyRoutes);
app.route('/', sessionRoutes);
app.route('/', accountRoutes);
app.route('/', disconnectGoogleRoute);

// The SPA, last so it only catches what nothing above claimed.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
