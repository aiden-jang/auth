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

/*
 * The service: bindings, the middleware every route sits behind, and the route groups mounted
 * under it. The handlers themselves live in ./routes, one module per concern.
 */

const app = new Hono<Env2>();

// Safety net: any error a route does not handle itself is logged server-side (Workers Logs /
// `wrangler tail`) and returned as a generic 500. On the identity service especially, an internal
// failure must never leak a stack trace or implementation detail to the client.
app.onError(onUnhandledError);

// Security response headers on every route. CSRF is left to the session cookie's SameSite=Lax
// attribute, Turnstile, and the CORS allowlist below, since auth is intentionally callable
// cross-origin by the app frontends.
//
// Turnstile loads a script + iframe and phones home to challenges.cloudflare.com, so the auth
// pages need it allowed in script-src, frame-src, and connect-src on top of the shared default.
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
  // On every response, not just failures: a 200 with a surprising body needs correlating as much as a 500.
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

/**
 * Nothing under /auth is cacheable, and /auth/me least of all.
 *
 * It had no Cache-Control at all. A GET with no cache directives is *heuristically* cacheable, so
 * browsers were free to keep the signed-in `200 {user}` and hand it back later. The visible bug: sign
 * out, press back, the page re-checks the session, the browser answers from its own cache, and you are
 * apparently signed in again until a refresh bypasses it.
 *
 * The reason this is worse than a display glitch: these responses are per-session and the only Vary
 * here is Origin, not Cookie, so any shared cache between the browser and the Worker could in principle
 * serve one person's account to somebody else. `no-store` is the only correct answer for a response that
 * depends on who is asking.
 */
app.use('/auth/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, max-age=0');
  c.header('Pragma', 'no-cache');
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'auth' }));

/*
 * Mounted rather than declared here, so a change to passkeys is not an edit to the same file as
 * password reset. The middleware above -- request id, security headers, CORS, no-store -- still
 * applies to every route inside each group.
 */
app.route('/', signupRoutes);
app.route('/', googleRoutes);
app.route('/', passwordRoutes);
app.route('/', passkeyRoutes);
app.route('/', sessionRoutes);
app.route('/', accountRoutes);
app.route('/', disconnectGoogleRoute);

// Everything that isn't an API route: serve the login/account UI (SPA fallback via assets).
// Last, so it only ever catches what nothing above claimed.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
