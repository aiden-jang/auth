import { describe, expect, it } from "vitest";
import {
  MockRestaurantSource,
  googleTypesFor,
  isValidPhotoRef,
  mapFoursquarePlace,
  mapGooglePlace,
  passesRating,
  photoProxyUrl,
  type FoursquarePlace,
  type GooglePlace,
} from "./restaurantSource.js";

describe("mapFoursquarePlace", () => {
  it("maps a full place to our domain shape", () => {
    const place: FoursquarePlace = {
      fsq_place_id: "abc123",
      name: "Joe's Pizza",
      location: { address: "7 Carmine St" },
      categories: [{ name: "Pizzeria" }, { name: "Italian" }],
      distance: 320,
      price: 1,
      rating: 9.2,
      photos: [{ prefix: "https://fastly.fsq.com/p/", suffix: "/abc.jpg" }],
    };
    const r = mapFoursquarePlace(place);
    expect(r).toEqual({
      id: "abc123",
      name: "Joe's Pizza",
      category: "Pizzeria",
      priceTier: 1,
      rating: 4.6, // 9.2 / 2
      distanceMeters: 320,
      imageUrl: "https://fastly.fsq.com/p/original/abc.jpg",
      address: "7 Carmine St",
    });
  });

  it("supplies safe defaults when optional fields are missing", () => {
    const r = mapFoursquarePlace({ fsq_place_id: "x", name: "Mystery Spot" });
    expect(r.category).toBe("Food");
    expect(r.priceTier).toBe(2);
    expect(r.rating).toBeNull();
    expect(r.distanceMeters).toBe(0);
    expect(r.imageUrl).toBeNull();
    expect(r.address).toBeNull();
  });

  it("clamps an out-of-range price tier", () => {
    expect(mapFoursquarePlace({ fsq_place_id: "x", name: "n", price: 9 }).priceTier).toBe(4);
    expect(mapFoursquarePlace({ fsq_place_id: "x", name: "n", price: 0 }).priceTier).toBe(1);
  });
});

describe("mapGooglePlace", () => {
  const center = { lat: 40.7128, lng: -74.006 };

  it("maps a full place to our domain shape", () => {
    const p: GooglePlace = {
      id: "g1",
      displayName: { text: "Joe's Pizza" },
      primaryTypeDisplayName: { text: "Pizza restaurant" },
      location: { latitude: 40.7128, longitude: -74.006 },
      rating: 4.5,
      userRatingCount: 1200,
      priceLevel: "PRICE_LEVEL_MODERATE",
      formattedAddress: "7 Carmine St",
      photos: [{ name: "places/g1/photos/x" }],
    };
    expect(mapGooglePlace(p, center, "https://api.example.com")).toEqual({
      id: "g1",
      name: "Joe's Pizza",
      category: "Pizza restaurant",
      priceTier: 2,
      rating: 4.5, // Google is already 0-5
      distanceMeters: 0, // same point as the center
      // Photo routed through our proxy so the API key stays server-side.
      imageUrl: "https://api.example.com/api/photo?ref=places%2Fg1%2Fphotos%2Fx",
      address: "7 Carmine St",
    });
  });

  it("uses a relative proxy URL when no base is given (dev)", () => {
    const p: GooglePlace = {
      id: "g3",
      displayName: { text: "Snap Shack" },
      photos: [{ name: "places/g3/photos/abc" }],
    };
    expect(mapGooglePlace(p, center).imageUrl).toBe("/api/photo?ref=places%2Fg3%2Fphotos%2Fabc");
  });

  it("computes distance from the search center", () => {
    const p: GooglePlace = {
      id: "g2",
      displayName: { text: "Up North" },
      location: { latitude: 40.7218, longitude: -74.006 }, // ~0.009 deg lat north
    };
    const { distanceMeters } = mapGooglePlace(p, center);
    expect(distanceMeters).toBeGreaterThan(900);
    expect(distanceMeters).toBeLessThan(1100);
  });

  it("maps price-level enums and falls back safely", () => {
    const base: GooglePlace = { id: "x", displayName: { text: "n" } };
    expect(mapGooglePlace({ ...base, priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }, center).priceTier).toBe(4);
    expect(mapGooglePlace({ ...base, priceLevel: "PRICE_LEVEL_INEXPENSIVE" }, center).priceTier).toBe(1);
    expect(mapGooglePlace(base, center).priceTier).toBe(2); // missing -> 2
    expect(mapGooglePlace(base, center).rating).toBeNull();
    expect(mapGooglePlace(base, center).category).toBe("Food");
    expect(mapGooglePlace(base, center).distanceMeters).toBe(0); // no location
    expect(mapGooglePlace(base, center).imageUrl).toBeNull(); // no photos
  });
});

describe("isValidPhotoRef", () => {
  it("accepts a well-formed photo resource name", () => {
    expect(isValidPhotoRef("places/ChIJ_abc-123/photos/AeXy_9-Z")).toBe(true);
  });

  it("rejects anything that could escape the media path", () => {
    expect(isValidPhotoRef("places/x/photos/y/../../evil")).toBe(false);
    expect(isValidPhotoRef("../secrets")).toBe(false);
    expect(isValidPhotoRef("places/x/media")).toBe(false);
    expect(isValidPhotoRef("https://evil.example/x")).toBe(false);
    expect(isValidPhotoRef("")).toBe(false);
  });
});

describe("photoProxyUrl", () => {
  it("encodes the ref and honors the base", () => {
    expect(photoProxyUrl("places/g1/photos/x")).toBe("/api/photo?ref=places%2Fg1%2Fphotos%2Fx");
    expect(photoProxyUrl("places/g1/photos/x", "https://api.example.com")).toBe(
      "https://api.example.com/api/photo?ref=places%2Fg1%2Fphotos%2Fx",
    );
  });
});

describe("googleTypesFor", () => {
  it("maps known cuisines and dedupes", () => {
    expect(googleTypesFor(["Pizza", "pizza", "Sushi"])).toEqual([
      "pizza_restaurant",
      "sushi_restaurant",
    ]);
  });

  it("falls back to a generic restaurant search when empty or unmapped", () => {
    expect(googleTypesFor([])).toEqual(["restaurant"]);
    expect(googleTypesFor(["Interpretive Dance"])).toEqual(["restaurant"]);
  });
});

describe("passesRating", () => {
  it("lets everything through with no minimum", () => {
    expect(passesRating(null, 0)).toBe(true);
    expect(passesRating(null, undefined)).toBe(true);
    expect(passesRating(2.1, 0)).toBe(true);
  });

  it("drops unrated and below-threshold places when a minimum is set", () => {
    expect(passesRating(null, 4)).toBe(false);
    expect(passesRating(3.9, 4)).toBe(false);
    expect(passesRating(4, 4)).toBe(true);
    expect(passesRating(4.6, 4)).toBe(true);
  });
});

describe("MockRestaurantSource minRating filter", () => {
  it("keeps only places at or above the minimum rating", async () => {
    const deck = await new MockRestaurantSource().fetchDeck({
      radiusMeters: 50_000,
      maxPriceTier: 4,
      categories: [],
      minRating: 4.4,
    });
    expect(deck.every((r) => (r.rating ?? 0) >= 4.4)).toBe(true);
    expect(deck.map((r) => r.name)).toContain("Probably Fine Tacos"); // 4.6
    expect(deck.map((r) => r.name)).not.toContain("Salad, I Guess"); // 3.9
  });
});
