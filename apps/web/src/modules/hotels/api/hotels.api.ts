import { apiGet, apiGetAuth, apiGetPaginated, apiPatchAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { PlaceDetail } from '@/modules/places/types';
import type { Amenity } from '@/modules/amenities/types';
import type { HotelCard, HotelSort, HotelType } from '../types';

// Hotel = Place (category='hotel') + satellite (ADR-002). getHotel trả base Place + hotel extras.
export interface HotelRoom {
  id: string;
  name: string;
  capacity: number | null;
  price_ref: number | null;
  currency: string;
  sort_order: number;
}

// "Hạng sao có nguồn" (product spec, 2026-09-29) — object rời (title/url/verified_at) hoặc null,
// KHÔNG BAO GIỜ suy đoán — khớp HotelsService.mapHotelDetails (apps/api).
export interface HotelStarRatingSource {
  title: string | null;
  url: string | null;
  verified_at: string | null;
}

// Hình dạng CÔNG KHAI (`GET /hotels/:slug` → `.hotel_details`) — HotelsService.getBySlug() dùng
// mapHotelDetails() trực tiếp: hoặc `null` (place_hotel_details chưa tồn tại) hoặc ĐỦ cả 5 trường
// (không có content_version — trang công khai không sửa gì nên không cần token CAS).
export interface HotelDetails {
  star_rating: number | null;
  hotel_type: HotelType;
  check_in: string | null;
  check_out: string | null;
  star_rating_source: HotelStarRatingSource | null;
}

// Hình dạng ĐẶC QUYỀN (`GET/PATCH /hotels/:id/details`, HotelsService.getDetails/updateDetails) —
// KHÁC hẳn HotelDetails ở trên: `content_version` (token CAS, 2026-09-30) LUÔN có mặt, nhưng các
// trường detail khác VẮNG MẶT (không phải `null`) khi place_hotel_details CHƯA từng được tạo (hotel
// vừa tạo, chưa PATCH lần nào) — khác hẳn "đã xoá giá trị" (null tường minh). Khớp đúng
// `{ ...mapHotelDetails(row), content_version }`: spread của `null` là `{}` nên các field detail
// biến mất thay vì thành `null`.
export interface HotelDetailsAdmin {
  content_version: number;
  star_rating?: number | null;
  hotel_type?: HotelType;
  check_in?: string | null;
  check_out?: string | null;
  star_rating_source?: HotelStarRatingSource | null;
}

export type HotelDetail = PlaceDetail & {
  hotel_details: HotelDetails | null;
  rooms: HotelRoom[];
  // BUG THẬT đã sửa (2026-09-30): trước đây khai `string[]`, nhưng
  // HotelsRepository.listAmenities() (apps/api) trả về mảng object {id,code,label_vi,label_en,
  // icon,group} — khớp đúng hình dạng thật, không phải chuỗi rời.
  amenities: Amenity[];
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

// PATCH TỪNG PHẦN thật (product spec, 2026-09-29) — field bỏ qua (`undefined`) giữ nguyên giá trị
// cũ, field gửi `null` XOÁ (JSON.stringify loại key `undefined`, giữ nguyên `null` — khớp đúng
// hợp đồng backend, xem UpdateHotelDetailsDto/HotelsRepository.upsertDetails). hotel_type BẮT
// BUỘC (NOT NULL ở DB) — form phải luôn gửi lại giá trị hiện tại, không được để trống.
// `expected_content_version` (2026-09-30) — CAS thật, BẮT BUỘC: token đọc từ GET details gần nhất
// (place.content_version), gửi lại nguyên vẹn. Không khớp -> 409 (xem ApiError.status ở caller).
export interface UpdateHotelDetailsInput {
  expected_content_version: number;
  hotel_type: HotelType;
  star_rating?: number | null;
  star_rating_source_id?: string | null;
  check_in?: string | null;
  check_out?: string | null;
}

// Đặc quyền — hoạt động cả khi hotel còn draft/pending (GET /hotels/:slug @Public() chỉ trả place
// đã published). Dùng để tải lại giá trị hiện tại cho form sửa. Luôn trả về một object (có
// content_version) — KHÔNG còn `null` (place_hotel_details chưa tồn tại chỉ khiến các field detail
// vắng mặt, xem HotelDetails's ghi chú).
export async function getHotelDetails(placeId: string, accessToken: string): Promise<HotelDetailsAdmin> {
  return apiGetAuth<HotelDetailsAdmin>(`/hotels/${encodeURIComponent(placeId)}/details`, accessToken, {
    cache: 'no-store',
  });
}

export async function updateHotelDetails(
  placeId: string,
  payload: UpdateHotelDetailsInput,
  accessToken: string,
): Promise<HotelDetailsAdmin> {
  return apiPatchAuth<HotelDetailsAdmin>(`/hotels/${encodeURIComponent(placeId)}/details`, accessToken, payload);
}
