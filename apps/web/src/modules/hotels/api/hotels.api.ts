import { apiGet, apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { PlaceDetail } from '@/modules/places/types';
import type { HotelCard, HotelSort } from '../types';

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

// `locale` TÙY CHỌN (2026-09-17 real-data pass, cùng mẫu `places.api.ts`'s `getPlace()`):
// `GET /hotels/:slug` đã hỗ trợ `?locale=` từ trước ở API (xác nhận trực tiếp trên production —
// `?locale=en` trả tên/mô tả tiếng Anh thật khác bản `vi` cho hotel đã có bản dịch duyệt), nhưng
// hàm này trước đây KHÔNG BAO GIỜ truyền query đó — trang `/en/hotels/{slug}` luôn nhận nội dung
// mặc định của server bất kể route là `/en` hay `/vi`. Mặc định `'vi'` để lời gọi cũ (nếu còn) vẫn
// giữ nguyên hành vi.
//
// Gộp nhánh 2026-09-23: bản backend đang chạy TẠI ĐÂY (sau merge) đã thật sự forward `locale` —
// `HotelsService.getBySlug(slug, locale)` → `PlacesService.getBySlug(slug, locale)` (xác nhận trực
// tiếp trong `apps/api/src/modules/hotels/hotels.service.ts`, dòng đó tự merge sạch, không xung
// đột) — không còn là "known limitation" như một bản chú thích cũ (đã bỏ) từng ghi.
export async function getHotel(slug: string, locale: string = 'vi'): Promise<HotelDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<HotelDetail>(`/hotels/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
}

// Sitemap-only slug list (apps/web/src/app/sitemap.ts). `id` (SEO1, 2026-09-22) — the list
// endpoint's response already includes it (hotels.service.ts's list() mapper), just not
// previously declared here; needed to batch-check EN indexability via
// POST /places/en-indexable-ids without a second round trip per entity.
export async function listHotelSlugs(limit = 100): Promise<Array<{ slug: string; id: string }>> {
  return apiGet<Array<{ slug: string; id: string }>>(`/hotels?limit=${limit}`, { cache: 'no-store' });
}

export interface ListHotelsParams {
  page?: number;
  limit?: number;
  stars?: number;
  sort?: HotelSort;
}

/** Trang browse /hotels — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listHotels(
  params: ListHotelsParams = {},
): Promise<{ data: HotelCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.stars) qs.set('stars', String(params.stars));
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<HotelCard>(`/hotels${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
