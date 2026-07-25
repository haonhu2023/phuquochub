import { apiGet } from '@/lib/http';
import type { GeoPoint, PlaceDetail } from '@/modules/places/types';

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

// MVP SEO pass: minimal slug list for sitemap.ts -- no list PAGE exists for /tours, so this is
// intentionally not wired into any UI, only the sitemap.
export async function listTourSlugs(limit = 100): Promise<Array<{ slug: string }>> {
  return apiGet<Array<{ slug: string }>>(`/tours?limit=${limit}`, { cache: 'no-store' });
}
