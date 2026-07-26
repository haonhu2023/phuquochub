import { apiGet, apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { PlaceDetail } from '@/modules/places/types';
import type { HotelCard, HotelSort } from '../types';

// Hotel = Place (category='hotel') + satellite (ADR-002). getHotel trả base Place + hotel extras.
export interface HotelRoom {
  id: string;
  name: string;
  capacity: number | null;
  price_ref: number | null;
  currency: string;
  sort_order: number;
}

export type HotelDetail = PlaceDetail & {
  hotel_details: Record<string, unknown> | null;
  rooms: HotelRoom[];
  amenities: string[];
};

export async function getHotel(slug: string): Promise<HotelDetail> {
  return apiGet<HotelDetail>(`/hotels/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}

// Sitemap-only slug list (apps/web/src/app/sitemap.ts).
export async function listHotelSlugs(limit = 100): Promise<Array<{ slug: string }>> {
  return apiGet<Array<{ slug: string }>>(`/hotels?limit=${limit}`, { cache: 'no-store' });
}

export interface ListHotelsParams {
  page?: number;
  limit?: number;
  stars?: number;
  sort?: HotelSort;
}

/** Trang browse /hotels — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listHotels(
  params: ListHotelsParams = {},
): Promise<{ data: HotelCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.stars) qs.set('stars', String(params.stars));
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<HotelCard>(`/hotels${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
