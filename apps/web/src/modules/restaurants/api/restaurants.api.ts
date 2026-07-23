import { apiGet } from '@/lib/http';
import type { PlaceDetail } from '@/modules/places/types';

// Restaurant = Place (category='restaurant') + satellite (ADR-002).
export interface MenuItem {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  tags: string[] | null;
  sort_order: number;
}

export interface MenuSection {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItem[];
}

export type RestaurantDetail = PlaceDetail & {
  restaurant_details: Record<string, unknown> | null;
  cuisines: string[];
};

export async function getRestaurant(slug: string): Promise<RestaurantDetail> {
  return apiGet<RestaurantDetail>(`/restaurants/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}

export async function getMenu(placeId: string): Promise<MenuSection[]> {
  return apiGet<MenuSection[]>(`/restaurants/${encodeURIComponent(placeId)}/menu`, { cache: 'no-store' });
}
