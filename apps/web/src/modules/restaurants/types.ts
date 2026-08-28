import type { GeoPoint, PriceRangeValue, VerificationStatusValue } from '@/modules/places/types';

export const RESTAURANT_SORT_VALUES = ['rating_desc', 'name_asc'] as const;
export type RestaurantSort = (typeof RESTAURANT_SORT_VALUES)[number];

// Thẻ nhà hàng cho trang browse (/restaurants) — khớp RestaurantsService.list() (apps/api).
export interface RestaurantCard {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  price_range: PriceRangeValue | null;
  verification_status: VerificationStatusValue;
  is_local_specialty: boolean;
  /** Nhãn tiếng Việt (label_vi) từ bảng cuisines — đã dịch sẵn ở backend, không hardcode ở FE. */
  cuisines: string[];
  location: GeoPoint;
}
