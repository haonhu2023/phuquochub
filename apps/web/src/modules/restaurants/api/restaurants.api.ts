import { apiGet, apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { PlaceDetail } from '@/modules/places/types';
import type { RestaurantCard, RestaurantSort } from '../types';

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

// Sitemap-only slug list (apps/web/src/app/sitemap.ts).
export async function listRestaurantSlugs(limit = 100): Promise<Array<{ slug: string }>> {
  return apiGet<Array<{ slug: string }>>(`/restaurants?limit=${limit}`, { cache: 'no-store' });
}

export interface ListRestaurantsParams {
  page?: number;
  limit?: number;
  price_range?: string;
  cuisine?: string;
  sort?: RestaurantSort;
}

/** Trang browse /restaurants — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listRestaurants(
  params: ListRestaurantsParams = {},
): Promise<{ data: RestaurantCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.cuisine) qs.set('cuisine', params.cuisine);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<RestaurantCard>(`/restaurants${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
