import type { GeoPoint } from '@/modules/places/types';

export const HOTEL_SORT_VALUES = ['rating_desc', 'name_asc'] as const;
export type HotelSort = (typeof HOTEL_SORT_VALUES)[number];

// Thẻ khách sạn cho trang browse (/hotels) — khớp HotelsService.list() (apps/api), KHÔNG phải
// schema `Hotel` đầy đủ trong openapi.yaml (schema đó dành cho chi tiết, có rooms/amenities).
export interface HotelCard {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  star_rating: number | null;
  hotel_type: string;
  location: GeoPoint;
}
