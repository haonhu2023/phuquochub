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

// `locale` TÙY CHỌN, cùng mẫu `getHotel()`/`places.api.ts`'s `getPlace()` (2026-09-17 real-data
// pass) — trước đây hàm này không truyền `?locale=` nên `/en/restaurants/{slug}` luôn nhận nội
// dung mặc định của server bất kể route.
export async function getRestaurant(slug: string, locale: string = 'vi'): Promise<RestaurantDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<RestaurantDetail>(`/restaurants/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
}

export async function getMenu(placeId: string): Promise<MenuSection[]> {
  return apiGet<MenuSection[]>(`/restaurants/${encodeURIComponent(placeId)}/menu`, { cache: 'no-store' });
}

// Sitemap-only slug list (apps/web/src/app/sitemap.ts). `id` (SEO1, 2026-09-22) — same reasoning
// as listHotelSlugs().
export async function listRestaurantSlugs(limit = 100): Promise<Array<{ slug: string; id: string }>> {
  return apiGet<Array<{ slug: string; id: string }>>(`/restaurants?limit=${limit}`, { cache: 'no-store' });
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
