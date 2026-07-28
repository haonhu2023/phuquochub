import type { GeoPoint, PriceRangeValue, VerificationStatusValue } from '@/modules/places/types';

export const BEACH_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type BeachSort = (typeof BEACH_SORT_VALUES)[number];

/**
 * Thẻ bãi biển cho trang browse (/beaches) — khớp BeachesService.list() (apps/api).
 *
 * Bãi biển KHÔNG có bảng vệ tinh riêng (giống Attraction): đây là Place có
 * `categories.slug = 'beach'`, nên mọi trường ở đây đều là trường của Place. Vì thế thẻ trỏ về
 * `/places/[slug]` — trang chi tiết DUY NHẤT của một Place, không nhân bản sang `/beaches/[slug]`.
 */
export interface BeachCard {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  price_range: PriceRangeValue | null;
  /** Phường/xã (places.ward) — vd "An Thới". */
  ward: string | null;
  verification_status: VerificationStatusValue;
  location: GeoPoint;
}
