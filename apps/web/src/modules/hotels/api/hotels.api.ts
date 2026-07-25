import { apiGet } from '@/lib/http';
import type { PlaceDetail } from '@/modules/places/types';

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

// MVP SEO pass: minimal slug list for sitemap.ts -- no list PAGE exists for /hotels, so this is
// intentionally not wired into any UI, only the sitemap.
export async function listHotelSlugs(limit = 100): Promise<Array<{ slug: string }>> {
  return apiGet<Array<{ slug: string }>>(`/hotels?limit=${limit}`, { cache: 'no-store' });
}
