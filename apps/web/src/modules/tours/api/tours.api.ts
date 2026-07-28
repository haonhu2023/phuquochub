import { apiGet, apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { GeoPoint, PlaceDetail } from '@/modules/places/types';
import type { TourCard, TourSort } from '../types';

// Tour = Place (category='tour') + satellite (ADR-002).
export interface TourStop {
  id: string;
  name: string;
  sort_order: number;
  time: string | null;
  note: string | null;
  location: GeoPoint | null;
}

export interface TourSchedule {
  id: string;
  date: string;
  capacity: number | null;
  price: number | null;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
}

export type TourDetail = PlaceDetail & { tour_details: Record<string, unknown> | null };

export async function getTour(slug: string): Promise<TourDetail> {
  return apiGet<TourDetail>(`/tours/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}

export async function getItinerary(placeId: string): Promise<TourStop[]> {
  return apiGet<TourStop[]>(`/tours/${encodeURIComponent(placeId)}/itinerary`, { cache: 'no-store' });
}

export async function getSchedule(placeId: string): Promise<TourSchedule[]> {
  return apiGet<TourSchedule[]>(`/tours/${encodeURIComponent(placeId)}/schedule`, { cache: 'no-store' });
}

// Sitemap-only slug list (apps/web/src/app/sitemap.ts) — trang browse dùng listTours() bên dưới
// vì nó cần cả `meta` để phân trang.
export async function listTourSlugs(limit = 100): Promise<Array<{ slug: string }>> {
  return apiGet<Array<{ slug: string }>>(`/tours?limit=${limit}`, { cache: 'no-store' });
}

export interface ListToursParams {
  page?: number;
  limit?: number;
  type?: string;
  difficulty?: string;
  price_range?: string;
  max_duration_minutes?: number;
  departure_area?: string;
  sort?: TourSort;
}

/** Trang browse /tours — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listTours(
  params: ListToursParams = {},
): Promise<{ data: TourCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.type) qs.set('type', params.type);
  if (params.difficulty) qs.set('difficulty', params.difficulty);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.max_duration_minutes) qs.set('max_duration_minutes', String(params.max_duration_minutes));
  if (params.departure_area) qs.set('departure_area', params.departure_area);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<TourCard>(`/tours${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
