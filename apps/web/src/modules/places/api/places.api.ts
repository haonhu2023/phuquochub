import { apiGet, apiGetPaginated, apiPostPublic } from '@/lib/http';
import type { PlaceCard, PlaceDetail } from '../types';

export interface ListPlacesParams {
  category?: string;
  ward?: string;
  price_range?: string;
  page?: number;
  limit?: number;
}

export async function listPlaces(params: ListPlacesParams = {}): Promise<PlaceCard[]> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiGet<PlaceCard[]>(`/places${q ? `?${q}` : ''}`, { cache: 'no-store' });
}

/**
 * Tổng số place đã `published` — dùng cho tín hiệu "freshness" trên trang chủ (MapCta), KHÔNG
 * phải để phân trang. `limit=1` để lấy `meta.total` với chi phí gần như bằng không (CÙNG endpoint
 * `GET /places` đã dùng ở `listPlaces`, không phải API mới); `apiGetPaginated` (khác `apiGet`) là
 * hàm DUY NHẤT trong `lib/http.ts` còn giữ `meta`.
 */
export async function countPublishedPlaces(): Promise<number> {
  const { meta } = await apiGetPaginated<PlaceCard>('/places?limit=1', { cache: 'no-store' });
  return meta.total;
}

// Public Place i18n Read Path (2026-09-02): `locale` TÙY CHỌN, khớp `?locale=` API vừa hỗ trợ ở
// GET /places/{slug}. Web chưa có ngôn ngữ nào khác 'vi' để chọn (không có route locale, không có
// language selector) — mặc định 'vi' ở ĐÂY chỉ khớp đúng hành vi hiện có (mọi UI hôm nay là tiếng
// Việt), KHÔNG phải một quyết định UX mới. Việc truyền 'en' hay locale khác thuộc về một tính
// năng chọn ngôn ngữ chưa tồn tại — xem ghi chú "Known limitations" trong báo cáo tính năng này.
export async function getPlace(slug: string, locale: string = 'vi'): Promise<PlaceDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<PlaceDetail>(`/places/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
}

// SEO1 (2026-09-22) — sitemap-only. Given up to hundreds of place/hotel/restaurant/tour ids
// (they're all rows in `places`, category-filtered — see PlacesService.listEnIndexableIds's
// comment), returns the subset whose EN detail page is actually eligible for indexing (BOTH
// display_name AND short_description approved for locale 'en' — matches lib/seo.ts's
// isEnDetailIndexable()). Empty input → empty output, no request made (never call a public
// endpoint with a pointless empty body).
export async function listEnIndexablePlaceIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  return apiPostPublic<string[]>('/places/en-indexable-ids', { ids });
}
