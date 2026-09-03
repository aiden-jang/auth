import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DEFAULT_CSP, harden } from './harden.js';
import { onUnhandledError, requestIdFrom } from './requestId.js';
import type { Env2 } from './http/context.js';
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

// CSRF is left to SameSite=Lax, Turnstile and the CORS allowlist, because auth is deliberately
// callable cross-origin. Turnstile needs its own origin in script-src, frame-src and connect-src.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const AUTH_CSP =
  DEFAULT_CSP.replace("script-src 'self'", `script-src 'self' ${TURNSTILE_ORIGIN}`).replace(
    "connect-src 'self' https://static.cloudflareinsights.com",
    `connect-src 'self' https://static.cloudflareinsights.com ${TURNSTILE_ORIGIN}`,
  ) + `; frame-src ${TURNSTILE_ORIGIN}`;
app.use('*', async (c, next) => {
  const requestId = requestIdFrom(c.req.raw);
  c.set('requestId', requestId);
  await next();
  // On every response: a 200 with a surprising body needs correlating as much as a 500.
  c.header('x-request-id', requestId);
});

app.use('*', harden({ csrf: false, csp: AUTH_CSP }));

app.use('/auth/*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = c.env.CORS_ORIGINS?.split(',').map((o) => o.trim());
      if (!allowed || allowed.length === 0) return origin;
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
  })(c, next),
);

/*
 * Nothing under /auth is cacheable. A GET with no cache directives is heuristically cacheable, and
 * these responses depend on who is asking while the only Vary is Origin, not Cookie -- so a shared
 * cache could serve one person's account to somebody else.
 */
app.use('/auth/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Pragma', 'no-cache');
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

/* One module per concern, so a change to passkeys is not an edit to the same file as password
   reset. Everything above still applies to each group. */
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
