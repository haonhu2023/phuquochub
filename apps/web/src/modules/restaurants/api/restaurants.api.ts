import { apiGet, apiGetAuth, apiGetPaginated, apiPatchAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { PlaceDetail } from '@/modules/places/types';
import type { RestaurantCard, RestaurantSort } from '../types';

// Restaurant = Place (category='restaurant') + satellite (ADR-002).
export interface MenuItem {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  tags: string[] | null;
  // "Món nổi bật" (product spec, 2026-09-29) — AddRestaurantMenuItemSignature.
  is_signature: boolean;
  sort_order: number;
}

export interface MenuSection {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItem[];
}

// `is_local_specialty`/`dietary` vắng mặt (không phải `null`) khi place_restaurant_details CHƯA
// từng được tạo — xem HotelDetails's ghi chú tương tự ở hotels.api.ts.
export interface RestaurantDetails {
  is_local_specialty?: boolean;
  dietary?: Record<string, unknown> | null;
}

// Cùng hình dạng cuisines của Restaurant TRÊN THẺ (label_vi đã dịch), nhưng chi tiết trả OBJECT
// đầy đủ (RestaurantsRepository.listCuisines) — BUG THẬT đã sửa (2026-09-30): trước đây khai
// `cuisines: string[]` cho cả detail, sai hình dạng thật của RestaurantsService.getBySlug().
export interface RestaurantCuisine {
  id: string;
  code: string;
  label_vi: string;
  label_en: string | null;
}

export type RestaurantDetail = PlaceDetail & {
  restaurant_details: RestaurantDetails | null;
  cuisines: RestaurantCuisine[];
};

// `locale` TÙY CHỌN, cùng mẫu `getHotel()`/`places.api.ts`'s `getPlace()` (2026-09-17 real-data
// pass) — trước đây hàm này không truyền `?locale=` nên `/en/restaurants/{slug}` luôn nhận nội
// dung mặc định của server bất kể route.
export async function getRestaurant(slug: string, locale: string = 'vi'): Promise<RestaurantDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<RestaurantDetail>(`/restaurants/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
}

export async function getMenu(placeId: string): Promise<MenuSection[]> {
  return apiGet<MenuSection[]>(`/restaurants/${encodeURIComponent(placeId)}/menu`, { cache: 'no-store' });
}

export interface MenuItemInput {
  name: string;
  price?: number;
  currency?: string;
  tags?: unknown;
  is_signature?: boolean;
  sort_order?: number;
}

export interface MenuSectionInput {
  name: string;
  sort_order?: number;
  items: MenuItemInput[];
}

// Đặc quyền (Place.Edit.Managed) — PATCH :id/menu THAY TOÀN BỘ sections (replace-all, không patch
// từng món — khớp UpdateRestaurantMenuDto/RestaurantsRepository.replaceMenu phía API). Response
// KHÔNG redact giá (publicResponse mặc định false ở RestaurantsService.getMenu/updateMenu) — actor
// thấy đúng giá vừa lưu. LƯU Ý: public GET :id/menu luôn null hoá `price` của MỌI món — khác
// price_history, món ăn trong thực đơn KHÔNG có cột verification/trust riêng để qua được trạng
// thái "đã xác minh" (gate "fail-closed" cố ý, xem RestaurantsService's ghi chú đầu file) — giá
// món nhập ở đây sẽ KHÔNG BAO GIỜ hiện công khai cho tới khi có một migration/ADR riêng thêm cột đó.
export async function updateMenu(
  placeId: string,
  sections: MenuSectionInput[],
  accessToken: string,
): Promise<MenuSection[]> {
  return apiPatchAuth<MenuSection[]>(`/restaurants/${encodeURIComponent(placeId)}/menu`, accessToken, { sections });
}

// Sitemap-only slug list (apps/web/src/app/sitemap.ts). `id` (SEO1, 2026-09-22) — same reasoning
// as listHotelSlugs().
export async function listRestaurantSlugs(limit = 100): Promise<Array<{ slug: string; id: string }>> {
  return apiGet<Array<{ slug: string; id: string }>>(`/restaurants?limit=${limit}`, { cache: 'no-store' });
}

export interface ListRestaurantsParams {
  page?: number;
  limit?: number;
  price_range?: string;
  cuisine?: string;
  sort?: RestaurantSort;
}

/** Trang browse /restaurants — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listRestaurants(
  params: ListRestaurantsParams = {},
): Promise<{ data: RestaurantCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.cuisine) qs.set('cuisine', params.cuisine);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<RestaurantCard>(`/restaurants${q ? `?${q}` : ''}`, { cache: 'no-store' });
}

/** GET /restaurants/cuisines — toàn bộ từ điển (công khai), dùng cho admin UI chọn. */
export async function listAllCuisines(): Promise<RestaurantCuisine[]> {
  return apiGet<RestaurantCuisine[]>('/restaurants/cuisines', { cache: 'no-store' });
}

// PATCH TỪNG PHẦN thật — field bỏ qua giữ nguyên, field `null` xoá (chỉ có ý nghĩa với `dietary`,
// `is_local_specialty` là boolean không có khái niệm xoá). `cuisine_codes` khi có mặt thay TOÀN BỘ
// gán hiện có (không patch từng phần tử) — khớp UpdateRestaurantDetailsDto (apps/api).
// `expected_content_version` (2026-09-30) — CAS thật, BẮT BUỘC: xem UpdateHotelDetailsInput's ghi
// chú tương tự ở hotels.api.ts. Cùng token bảo vệ CẢ `cuisine_codes` (một lần ghi, một transaction
// ở backend — xem RestaurantsRepository.upsertDetails).
export interface UpdateRestaurantDetailsInput {
  expected_content_version: number;
  is_local_specialty?: boolean;
  dietary?: Record<string, unknown> | null;
  cuisine_codes?: string[];
}

type RestaurantDetailsResponse = RestaurantDetails & { cuisines: RestaurantCuisine[]; content_version: number };

// Đặc quyền — hoạt động cả khi nhà hàng còn draft/pending (GET /restaurants/:slug @Public() chỉ
// trả place đã published). Dùng để tải lại giá trị hiện tại cho form sửa. Luôn trả một object (có
// content_version) — KHÔNG còn `null`.
export async function getRestaurantDetails(placeId: string, accessToken: string): Promise<RestaurantDetailsResponse> {
  return apiGetAuth(`/restaurants/${encodeURIComponent(placeId)}/details`, accessToken, { cache: 'no-store' });
}

export async function updateRestaurantDetails(
  placeId: string,
  payload: UpdateRestaurantDetailsInput,
  accessToken: string,
): Promise<RestaurantDetailsResponse> {
  return apiPatchAuth(`/restaurants/${encodeURIComponent(placeId)}/details`, accessToken, payload);
}
