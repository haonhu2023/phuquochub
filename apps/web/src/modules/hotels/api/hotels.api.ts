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

// Locale forwarding (2026-09, mirrors getPlace() in places.api.ts): `hotels/[slug]/page.tsx`
// resolves `locale` from the route but never passed it into this call, so every hotel page —
// `/vi/hotels/:slug` AND `/en/hotels/:slug` alike — always fetched (and rendered) the Vietnamese
// content. `locale` defaults to 'vi' for the same reason getPlace() does: zero behavior change
// for any existing caller that doesn't pass one.
//
// KNOWN LIMITATION, not fixed here (backend unchanged, per this task's explicit scope): unlike
// `GET /places/:slug`, `GET /hotels/:slug` does not read this query param at all —
// HotelsController.getBySlug() has no @Query() and HotelsService.getBySlug() calls
// `placesService.getBySlug(slug)` with no second argument, so PlacesService.getBySlug()'s
// `locale` parameter is always `undefined` (→ its own default) regardless of what this client
// sends. This change is necessary but NOT sufficient to fix the EN route on its own — see the
// PR description for the exact 3-line backend change that would complete it.
export async function getHotel(slug: string, locale: string = 'vi'): Promise<HotelDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<HotelDetail>(`/hotels/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
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
