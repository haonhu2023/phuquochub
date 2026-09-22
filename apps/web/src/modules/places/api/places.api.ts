import { apiGet, apiGetPaginated, apiPostPublic } from '@/lib/http';
import type { PlaceCard, PlaceDetail } from '../types';

export interface ListPlacesParams {
  category?: string;
  ward?: string;
  price_range?: string;
  page?: number;
  limit?: number;
}

// C1 (2026-09-22) — thay `no-store` bằng cache có tag: đọc công khai được phục vụ từ Next's Data
// Cache cho tới khi bị invalidate qua tag `places:list` (POST /api/revalidate, gọi SAU khi
// create/update/publish/unpublish một place thành công — xem EditPlaceView.tsx/NewPlaceView.tsx)
// HOẶC hết `revalidate: 60` giây — cửa sổ 60s là lưới an toàn cho trường hợp lệch tag/gọi revalidate
// thất bại, KHÔNG phải cơ chế chính (cơ chế chính là tag, cập nhật gần như tức thời). Tất cả biến
// thể filter (category/ward/price_range/page/limit) DÙNG CHUNG một tag `places:list` — đơn giản
// hơn một tag riêng cho từng tổ hợp filter, đánh đổi hợp lý vì filter kết quả không quá nhiều biến
// thể và một invalidation dư thừa chỉ tốn một lần fetch lại, không sai dữ liệu.
export async function listPlaces(params: ListPlacesParams = {}): Promise<PlaceCard[]> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiGet<PlaceCard[]>(`/places${q ? `?${q}` : ''}`, { next: { tags: ['places:list'], revalidate: 60 } });
}

/**
 * Tổng số place đã `published` — dùng cho tín hiệu "freshness" trên trang chủ (MapCta), KHÔNG
 * phải để phân trang. `limit=1` để lấy `meta.total` với chi phí gần như bằng không (CÙNG endpoint
 * `GET /places` đã dùng ở `listPlaces`, không phải API mới); `apiGetPaginated` (khác `apiGet`) là
 * hàm DUY NHẤT trong `lib/http.ts` còn giữ `meta`.
 */
export async function countPublishedPlaces(): Promise<number> {
  const { meta } = await apiGetPaginated<PlaceCard>('/places?limit=1', { next: { tags: ['places:list'], revalidate: 60 } });
  return meta.total;
}

// Public Place i18n Read Path (2026-09-02): `locale` TÙY CHỌN, khớp `?locale=` API vừa hỗ trợ ở
// GET /places/{slug}. Web chưa có ngôn ngữ nào khác 'vi' để chọn (không có route locale, không có
// language selector) — mặc định 'vi' ở ĐÂY chỉ khớp đúng hành vi hiện có (mọi UI hôm nay là tiếng
// Việt), KHÔNG phải một quyết định UX mới. Việc truyền 'en' hay locale khác thuộc về một tính
// năng chọn ngôn ngữ chưa tồn tại — xem ghi chú "Known limitations" trong báo cáo tính năng này.
// Tag theo SLUG (không phải id) — đây là khoá route thật (`/places/[slug]`), và slug bất biến sau
// khi tạo (UpdatePlaceDto không có trường slug — xem plan §4), nên tag không bao giờ trỏ sai sau
// khi place đổi tên hiển thị.
export async function getPlace(slug: string, locale: string = 'vi'): Promise<PlaceDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<PlaceDetail>(`/places/${encodeURIComponent(slug)}?${qs.toString()}`, {
    next: { tags: [`place:${slug}`], revalidate: 60 },
  });
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
