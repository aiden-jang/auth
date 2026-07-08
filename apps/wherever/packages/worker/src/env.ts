import type { SessionRoom } from "./sessionRoom.js";
import type { RateLimiter } from "./rateLimiter.js";

/** Bindings declared in wrangler.toml, surfaced to the Worker and DO. */
export interface Env {
  SESSION_ROOM: DurableObjectNamespace<SessionRoom>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  DB: D1Database;
  /** Which RestaurantSource to use: "google" (default in prod), "foursquare", or "mock". */
  RESTAURANT_SOURCE?: string;
  /** Google Places API (New) key. Restrict it to the Places API + your domain. */
  GOOGLE_PLACES_API_KEY?: string;
  FOURSQUARE_API_KEY?: string;
}
