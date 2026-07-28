import type { GeoPoint, PriceRangeValue, VerificationStatusValue } from '@/modules/places/types';

export const ATTRACTION_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type AttractionSort = (typeof ATTRACTION_SORT_VALUES)[number];

/**
 * Thẻ điểm tham quan cho trang browse (/attractions) — khớp AttractionsService.list() (apps/api).
 *
 * Điểm tham quan KHÔNG có bảng vệ tinh riêng (khác Hotel/Restaurant/Tour): đây là Place có
 * `categories.slug = 'attraction'`, nên mọi trường ở đây đều là trường của Place. Vì thế thẻ
 * trỏ về `/places/[slug]` — trang chi tiết DUY NHẤT của một Place, không nhân bản sang
 * `/attractions/[slug]`.
 */
export interface AttractionCard {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  price_range: PriceRangeValue | null;
  /** Phường/xã (places.ward) — vd "Dương Đông". */
  ward: string | null;
  verification_status: VerificationStatusValue;
  location: GeoPoint;
}
