import type { PriceTier, Restaurant, SessionFilters } from "@wherever/shared";

/**
 * The boundary between the app and wherever restaurants come from. Swap the
 * implementation without touching the rest of the Worker.
 */
export interface RestaurantSource {
  fetchDeck(filters: SessionFilters): Promise<Restaurant[]>;
}

/**
 * Client-side rating gate, shared by every source (no provider filters by rating server-side).
 * A minRating of 0/undefined lets everything through; otherwise an unrated place is dropped,
 * since we can't confirm it clears the bar.
 */
export function passesRating(rating: number | null, minRating?: number): boolean {
  if (!minRating) return true;
  return rating != null && rating >= minRating;
}

const MOCK_DECK: Restaurant[] = [
  { id: "mock-1", name: "The Usual", category: "Burgers", priceTier: 2, rating: 4.3, distanceMeters: 400, imageUrl: null, address: "12 Main St" },
  { id: "mock-2", name: "Probably Fine Tacos", category: "Tacos", priceTier: 1, rating: 4.6, distanceMeters: 750, imageUrl: null, address: "88 2nd Ave" },
  { id: "mock-3", name: "Noodle Situation", category: "Ramen", priceTier: 2, rating: 4.1, distanceMeters: 1100, imageUrl: null, address: "5 Bowl Ln" },
  { id: "mock-4", name: "Salad, I Guess", category: "Healthy", priceTier: 2, rating: 3.9, distanceMeters: 300, imageUrl: null, address: "200 Green St" },
  { id: "mock-5", name: "Late Night Pizza Decisions", category: "Pizza", priceTier: 1, rating: 4.4, distanceMeters: 950, imageUrl: null, address: "1 Slice Blvd" },
];

/** Returns seeded data, filtered just enough to behave like the real thing. */
export class MockRestaurantSource implements RestaurantSource {
  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    return MOCK_DECK.filter((r) => {
      if (r.priceTier > filters.maxPriceTier) return false;
      if (r.distanceMeters > filters.radiusMeters) return false;
      if (!passesRating(r.rating, filters.minRating)) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(r.category)) {
        return false;
      }
      return true;
    });
  }
}

// ---- Foursquare ----

/** Subset of a Foursquare place we care about (Places API, 2025 surface). */
export interface FoursquarePlace {
  fsq_place_id: string;
  name: string;
  location?: { address?: string; formatted_address?: string };
  categories?: { name: string }[];
  distance?: number;
  price?: number;
  rating?: number;
  photos?: { prefix: string; suffix: string }[];
}

function clampTier(n: number): PriceTier {
  return Math.min(4, Math.max(1, Math.round(n))) as PriceTier;
}

/** Pure mapping from a Foursquare place to our domain shape. Unit-tested. */
export function mapFoursquarePlace(p: FoursquarePlace): Restaurant {
  const photo = p.photos?.[0];
  return {
    id: p.fsq_place_id,
    name: p.name,
    category: p.categories?.[0]?.name ?? "Food",
    priceTier: clampTier(p.price ?? 2),
    // Foursquare rates 0-10; our UI shows a 0-5 star scale.
    rating: p.rating != null ? Math.round((p.rating / 2) * 10) / 10 : null,
    distanceMeters: p.distance ?? 0,
    imageUrl: photo ? `${photo.prefix}original${photo.suffix}` : null,
    address: p.location?.address ?? p.location?.formatted_address ?? null,
  };
}

// Fallback search center when the host did not share a location (e.g. denied
// geolocation). Foursquare requires an `ll`; this keeps the app functional.
const DEFAULT_LL = "40.7128,-74.0060"; // NYC

export class FoursquareRestaurantSource implements RestaurantSource {
  constructor(private readonly apiKey: string) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const ll =
      filters.lat != null && filters.lng != null
        ? `${filters.lat},${filters.lng}`
        : DEFAULT_LL;

    const params = new URLSearchParams({
      ll,
      radius: String(filters.radiusMeters),
      max_price: String(filters.maxPriceTier),
      limit: "50",
      query: filters.categories.length ? filters.categories.join(" ") : "restaurant",
      fields: "fsq_place_id,name,location,categories,distance,price,rating,photos",
    });

    const res = await fetch(
      `https://places-api.foursquare.com/places/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Places-Api-Version": "2025-06-17",
          accept: "application/json",
        },
      },
    );
    // Fail soft: an API hiccup shows "nothing nearby" rather than crashing.
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: FoursquarePlace[] };
    return (data.results ?? [])
      .filter((p) => p.fsq_place_id && p.name)
      .map(mapFoursquarePlace)
      .filter((r) => passesRating(r.rating, filters.minRating));
  }
}

// ---- Google Places (New) ----

/** Subset of a Google Places (New) place we read from a searchNearby response. */
export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  /** Enum string: PRICE_LEVEL_FREE | _INEXPENSIVE | _MODERATE | _EXPENSIVE | _VERY_EXPENSIVE. */
  priceLevel?: string;
  formattedAddress?: string;
  photos?: { name: string }[];
}

const GOOGLE_PRICE_TIER: Record<string, PriceTier> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * Our cuisine labels -> Google primary place types (see Places "Table A" restaurant types).
 * Anything unmapped falls back to a plain restaurant search.
 */
const CUISINE_TO_GOOGLE_TYPE: Record<string, string> = {
  burgers: "hamburger_restaurant",
  pizza: "pizza_restaurant",
  tacos: "mexican_restaurant",
  mexican: "mexican_restaurant",
  ramen: "ramen_restaurant",
  sushi: "sushi_restaurant",
  japanese: "japanese_restaurant",
  italian: "italian_restaurant",
  chinese: "chinese_restaurant",
  thai: "thai_restaurant",
  indian: "indian_restaurant",
  korean: "korean_restaurant",
  vietnamese: "vietnamese_restaurant",
  french: "french_restaurant",
  american: "american_restaurant",
  seafood: "seafood_restaurant",
  steak: "steak_house",
  bbq: "barbecue_restaurant",
  breakfast: "breakfast_restaurant",
  brunch: "brunch_restaurant",
  cafe: "cafe",
  coffee: "coffee_shop",
  dessert: "dessert_restaurant",
  vegetarian: "vegetarian_restaurant",
  vegan: "vegan_restaurant",
  greek: "greek_restaurant",
  mediterranean: "mediterranean_restaurant",
};

/** Map our cuisine labels to Google primary types; empty -> a generic restaurant search. */
export function googleTypesFor(categories: string[]): string[] {
  const types = categories
    .map((c) => CUISINE_TO_GOOGLE_TYPE[c.trim().toLowerCase()])
    .filter((t): t is string => Boolean(t));
  return types.length > 0 ? [...new Set(types)] : ["restaurant"];
}

/** Great-circle distance in meters between two lat/lng points. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Pure mapping from a Google place to our domain shape. Google's Nearby Search (New) doesn't
 * return distance, so we compute it from the search center. Unit-tested.
 */
export function mapGooglePlace(p: GooglePlace, center: { lat: number; lng: number }): Restaurant {
  return {
    id: p.id,
    name: p.displayName?.text ?? "Unknown spot",
    category: p.primaryTypeDisplayName?.text ?? "Food",
    priceTier: (p.priceLevel ? GOOGLE_PRICE_TIER[p.priceLevel] : undefined) ?? 2,
    // Google already rates 0-5, matching our scale.
    rating: p.rating != null ? Math.round(p.rating * 10) / 10 : null,
    distanceMeters: p.location
      ? haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude })
      : 0,
    // Photos need a Worker proxy so the API key stays server-side and the Place Photo SKU is
    // controlled; wired in a follow-up. Deck renders fine without images (like the mock).
    imageUrl: null,
    address: p.formattedAddress ?? null,
  };
}

// Fallback center when the host didn't share a location; keeps the app functional.
const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 }; // NYC

export class GooglePlacesRestaurantSource implements RestaurantSource {
  constructor(private readonly apiKey: string) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const center =
      filters.lat != null && filters.lng != null
        ? { lat: filters.lat, lng: filters.lng }
        : DEFAULT_CENTER;

    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        // Field mask drives the billing tier: request only what the deck shows. rating +
        // priceLevel bump the SKU tier; reviews and other Preferred fields are deliberately omitted.
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.primaryTypeDisplayName",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
          "places.formattedAddress",
        ].join(","),
      },
      body: JSON.stringify({
        includedPrimaryTypes: googleTypesFor(filters.categories),
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: {
            center: { latitude: center.lat, longitude: center.lng },
            radius: filters.radiusMeters,
          },
        },
      }),
    });
    // Fail soft: an API hiccup shows "nothing nearby" rather than crashing the round.
    if (!res.ok) return [];

    const data = (await res.json()) as { places?: GooglePlace[] };
    return (data.places ?? [])
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => mapGooglePlace(p, center))
      // Google filters by cuisine + radius server-side; price and rating are filtered here.
      .filter((r) => r.priceTier <= filters.maxPriceTier)
      .filter((r) => passesRating(r.rating, filters.minRating));
  }
}

export function createRestaurantSource(
  kind: string,
  apiKey?: string,
): RestaurantSource {
  switch (kind) {
    case "google":
      if (apiKey) return new GooglePlacesRestaurantSource(apiKey);
      // No key configured: degrade to mock instead of failing.
      return new MockRestaurantSource();
    case "foursquare":
      if (apiKey) return new FoursquareRestaurantSource(apiKey);
      return new MockRestaurantSource();
    case "mock":
    default:
      return new MockRestaurantSource();
  }
}
