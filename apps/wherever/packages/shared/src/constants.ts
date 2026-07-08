// Filter options shared by the web UI and the Worker, so the cuisine labels the
// user picks always line up with the types the restaurant source understands.
// `value` is what goes into SessionFilters.categories (lowercase; the Google
// source maps it to a primary type, the mock matches it case-insensitively).

import type { PriceTier } from "./types.js";

export interface CuisineOption {
  value: string;
  label: string;
  emoji: string;
}

export const CUISINE_OPTIONS: CuisineOption[] = [
  { value: "pizza", label: "Pizza", emoji: "🍕" },
  { value: "burgers", label: "Burgers", emoji: "🍔" },
  { value: "tacos", label: "Tacos", emoji: "🌮" },
  { value: "sushi", label: "Sushi", emoji: "🍣" },
  { value: "ramen", label: "Ramen", emoji: "🍜" },
  { value: "chinese", label: "Chinese", emoji: "🥡" },
  { value: "thai", label: "Thai", emoji: "🍤" },
  { value: "indian", label: "Indian", emoji: "🍛" },
  { value: "italian", label: "Italian", emoji: "🍝" },
  { value: "korean", label: "Korean", emoji: "🍲" },
  { value: "mexican", label: "Mexican", emoji: "🌯" },
  { value: "bbq", label: "BBQ", emoji: "🍖" },
  { value: "seafood", label: "Seafood", emoji: "🦞" },
  { value: "breakfast", label: "Breakfast", emoji: "🥞" },
  { value: "cafe", label: "Café", emoji: "☕" },
  { value: "dessert", label: "Dessert", emoji: "🍰" },
  { value: "vegetarian", label: "Vegetarian", emoji: "🥗" },
];

export interface RadiusOption {
  meters: number;
  label: string;
}

export const RADIUS_OPTIONS: RadiusOption[] = [
  { meters: 1600, label: "1 mi" },
  { meters: 4800, label: "3 mi" },
  { meters: 8000, label: "5 mi" },
  { meters: 16000, label: "10 mi" },
];

export interface RatingOption {
  value: number;
  label: string;
}

export const RATING_OPTIONS: RatingOption[] = [
  { value: 0, label: "Any" },
  { value: 3, label: "3.0+" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
];

export interface PriceOption {
  tier: PriceTier;
  label: string;
}

export const PRICE_OPTIONS: PriceOption[] = [
  { tier: 1, label: "$" },
  { tier: 2, label: "$$" },
  { tier: 3, label: "$$$" },
  { tier: 4, label: "$$$$" },
];

/** Human label for a cuisine value, falling back to the raw value. */
export function cuisineLabel(value: string): string {
  return CUISINE_OPTIONS.find((c) => c.value === value)?.label ?? value;
}
