import type { RateLimiter } from './rateLimiter.js';

/** Bindings + vars declared in wrangler.toml / secrets, surfaced to the Worker. */
export interface Env {
  // Identity store: users + sessions + one-time tokens.
  DB: D1Database;
  // Fixed-window rate limiter, one instance per action:ip.
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  // Shared parent domain for the session cookie (e.g. ".aidenjang.com"). Unset in local dev
  // (host-only cookie).
  COOKIE_DOMAIN?: string;
  // Comma-separated app origins allowed to call auth with credentials. Unset in dev reflects
  // the request origin.
  CORS_ORIGINS?: string;
  // Base URL of the auth UI, used to build email links (e.g. https://accounts.aidenjang.com).
  APP_URL?: string;
  // Email delivery (Resend). Unset = dev mode: emails are logged, not sent.
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Turnstile (CAPTCHA) secret. Unset = verification skipped (dev / not-yet-set).
  TURNSTILE_SECRET?: string;
}
