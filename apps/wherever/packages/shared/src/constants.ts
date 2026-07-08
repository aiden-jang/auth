// Filter options shared by the web UI and the Worker, so the cuisine labels the
// user picks always line up with the types the restaurant source understands.
// `value` is what goes into SessionFilters.categories (lowercase; the mock matches
// it case-insensitively). `googleType` is the Google Places (New) primary type the
// Worker searches for, keeping the mapping in one place so the two can't drift.

import type { PriceTier, RestaurantSort } from "./types.js";

export interface CuisineOption {
  value: string;
  label: string;
  emoji: string;
  /** Google Places (New) primary type (see Places "Table A" restaurant types). */
  googleType: string;
}

export const CUISINE_OPTIONS: CuisineOption[] = [
  { value: "pizza", label: "Pizza", emoji: "🍕", googleType: "pizza_restaurant" },
  { value: "burgers", label: "Burgers", emoji: "🍔", googleType: "hamburger_restaurant" },
  { value: "tacos", label: "Tacos", emoji: "🌮", googleType: "mexican_restaurant" },
  { value: "sushi", label: "Sushi", emoji: "🍣", googleType: "sushi_restaurant" },
  { value: "ramen", label: "Ramen", emoji: "🍜", googleType: "ramen_restaurant" },
  { value: "chinese", label: "Chinese", emoji: "🥡", googleType: "chinese_restaurant" },
  { value: "thai", label: "Thai", emoji: "🥘", googleType: "thai_restaurant" },
  { value: "indian", label: "Indian", emoji: "🍛", googleType: "indian_restaurant" },
  { value: "italian", label: "Italian", emoji: "🍝", googleType: "italian_restaurant" },
  { value: "korean", label: "Korean", emoji: "🍲", googleType: "korean_restaurant" },
  { value: "japanese", label: "Japanese", emoji: "🍱", googleType: "japanese_restaurant" },
  { value: "vietnamese", label: "Vietnamese", emoji: "🍜", googleType: "vietnamese_restaurant" },
  { value: "mexican", label: "Mexican", emoji: "🌯", googleType: "mexican_restaurant" },
  { value: "mediterranean", label: "Mediterranean", emoji: "🫒", googleType: "mediterranean_restaurant" },
  { value: "greek", label: "Greek", emoji: "🥙", googleType: "greek_restaurant" },
  { value: "middleeastern", label: "Middle Eastern", emoji: "🧆", googleType: "middle_eastern_restaurant" },
  { value: "french", label: "French", emoji: "🥖", googleType: "french_restaurant" },
  { value: "spanish", label: "Spanish", emoji: "🥘", googleType: "spanish_restaurant" },
  { value: "american", label: "American", emoji: "🍗", googleType: "american_restaurant" },
  { value: "bbq", label: "BBQ", emoji: "🍖", googleType: "barbecue_restaurant" },
  { value: "steak", label: "Steak", emoji: "🥩", googleType: "steak_house" },
  { value: "seafood", label: "Seafood", emoji: "🦞", googleType: "seafood_restaurant" },
  { value: "fastfood", label: "Fast food", emoji: "🍟", googleType: "fast_food_restaurant" },
  { value: "sandwich", label: "Sandwiches", emoji: "🥪", googleType: "sandwich_shop" },
  { value: "deli", label: "Deli", emoji: "🥓", googleType: "deli" },
  { value: "diner", label: "Diner", emoji: "🍳", googleType: "diner" },
  { value: "breakfast", label: "Breakfast", emoji: "🥞", googleType: "breakfast_restaurant" },
  { value: "brunch", label: "Brunch", emoji: "🥂", googleType: "brunch_restaurant" },
  { value: "vegetarian", label: "Vegetarian", emoji: "🥗", googleType: "vegetarian_restaurant" },
  { value: "vegan", label: "Vegan", emoji: "🌱", googleType: "vegan_restaurant" },
  { value: "cafe", label: "Café", emoji: "🥐", googleType: "cafe" },
  { value: "coffee", label: "Coffee", emoji: "☕", googleType: "coffee_shop" },
  { value: "bakery", label: "Bakery", emoji: "🥯", googleType: "bakery" },
  { value: "dessert", label: "Dessert", emoji: "🍰", googleType: "dessert_restaurant" },
  { value: "icecream", label: "Ice cream", emoji: "🍦", googleType: "ice_cream_shop" },
  { value: "juice", label: "Juice", emoji: "🧃", googleType: "juice_shop" },
  { value: "bar", label: "Bar", emoji: "🍸", googleType: "bar" },
  { value: "pub", label: "Pub", emoji: "🍺", googleType: "pub" },
  { value: "winebar", label: "Wine bar", emoji: "🍷", googleType: "wine_bar" },
];

/** Google primary type for a cuisine value (lowercased), or undefined if unknown. */
export function googleTypeFor(value: string): string | undefined {
  return CUISINE_OPTIONS.find((c) => c.value === value.trim().toLowerCase())?.googleType;
}

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

export interface ReviewsOption {
  value: number;
  label: string;
}

export const MIN_REVIEWS_OPTIONS: ReviewsOption[] = [
  { value: 0, label: "Any" },
  { value: 50, label: "50+" },
  { value: 200, label: "200+" },
  { value: 500, label: "500+" },
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

export interface SortOption {
  value: RestaurantSort;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: "popularity", label: "Best match" },
  { value: "distance", label: "Closest" },
];

/** Human label for a cuisine value, falling back to the raw value. */
export function cuisineLabel(value: string): string {
  return CUISINE_OPTIONS.find((c) => c.value === value)?.label ?? value;
}
