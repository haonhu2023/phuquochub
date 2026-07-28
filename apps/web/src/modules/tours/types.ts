import type { GeoPoint, PriceRangeValue } from '@/modules/places/types';

export const TOUR_SORT_VALUES = ['rating_desc', 'name_asc', 'duration_asc'] as const;
export type TourSort = (typeof TOUR_SORT_VALUES)[number];

// Khớp enum `tour_type` / `tour_difficulty` của migration InitTour (apps/api) — tập giá trị ĐÓNG
// ở DB nên khai union được, khác `cuisine`/`ward` (tham chiếu mở, để string).
export const TOUR_TYPE_VALUES = [
  'diving',
  'fishing',
  'trekking',
  'sightseeing',
  'cruise',
  'other',
] as const;
export type TourType = (typeof TOUR_TYPE_VALUES)[number];

export const TOUR_DIFFICULTY_VALUES = ['easy', 'moderate', 'hard'] as const;
export type TourDifficulty = (typeof TOUR_DIFFICULTY_VALUES)[number];

// Thẻ tour cho trang browse (/tours) — khớp ToursService.list() (apps/api), KHÔNG phải chi tiết
// tour (chi tiết còn có itinerary/schedule qua endpoint riêng).
export interface TourCard {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  price_range: PriceRangeValue | null;
  /** Khu vực khởi hành = places.ward (vd "An Thới"). */
  ward: string | null;
  tour_type: string;
  duration_minutes: number | null;
  difficulty: string | null;
  location: GeoPoint;
}
