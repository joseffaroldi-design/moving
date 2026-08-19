import { CITIES as CORE_CITIES, type City } from "./cities";
import { GROWTH_CITIES } from "./growthCities";

export const CITIES: City[] = [...CORE_CITIES, ...GROWTH_CITIES];
export const CITY_SLUGS = CITIES.map((c) => c.slug);
export const FEATURED_CITIES = CITIES.filter((c) => c.featured);

export function getCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}

export type { City };
