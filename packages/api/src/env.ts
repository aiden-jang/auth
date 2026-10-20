import type { RateLimiter } from './rateLimiter.js';

/** Bindings + vars declared in wrangler.toml / secrets, surfaced to the Worker. */
export interface Env {
  EVENT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  // Identity store: users + sessions + one-time tokens.
  DB: D1Database;
  // Fixed-window rate limiter, one instance per action:ip.
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  // The built login/account UI (packages/web/dist), served for non-API routes.
  ASSETS: Fetcher;
  // Shared parent domain for the session cookie (e.g. ".aidenjang.com"). Unset in local dev
  // (host-only cookie).
  COOKIE_DOMAIN?: string;
  // Explicit app origins allowed to use browser credentials, alongside the Accounts origin.
  CORS_ORIGINS?: string;
  // Base URL of the auth UI, used to build email links (e.g. https://accounts.aidenjang.com).
  APP_URL?: string;
  // Resend delivery. Missing keys print mail only when APP_URL is loopback.
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Turnstile (CAPTCHA) secret. Unset = verification skipped (dev / not-yet-set).
  TURNSTILE_SECRET?: string;
  // Google OAuth. Both unset = "Continue with Google" is disabled (the route errors out).
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Optional so local dev and the test worker run without it: an absent binding drops events.
  EVENTS?: AnalyticsEngineDataset;
}
