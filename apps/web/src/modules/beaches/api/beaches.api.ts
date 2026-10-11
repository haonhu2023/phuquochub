import { apiGet, apiGetAuth, apiGetPaginated, apiPatchAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { Amenity } from '@/modules/amenities/types';
import type { BeachCard, BeachSort } from '../types';

// Beach = Place (category='beach'), không có bảng vệ tinh ⇒ chỉ có đường ĐỌC danh sách ở đây.
// Chi tiết dùng `getPlace()` của modules/places (một hợp đồng chi tiết duy nhất), và sitemap
// cũng đã liệt kê các URL /places/{slug} đó — không cần hàm slug riêng.
export interface ListBeachesParams {
  page?: number;
  limit?: number;
  ward?: string;
  price_range?: string;
  sort?: BeachSort;
}

/** Trang browse /beaches — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listBeaches(
  params: ListBeachesParams = {},
): Promise<{ data: BeachCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<BeachCard>(`/beaches${q ? `?${q}` : ''}`, { cache: 'no-store' });
}

// Chi tiết bãi (place_beach_details) — cùng hợp đồng với BeachesController. Trường nguồn luôn đi kèm
// object nguồn rời (title/url/verified_at) hoặc null; không suy ra "an toàn" từ text.
export interface BeachSource {
  title: string | null;
  url: string | null;
  verified_at: string | null;
}

export interface BeachDetails {
  access_route: string | null;
  characteristics: string | null;
  services: string | null;
  best_season: string | null;
  best_season_source: BeachSource | null;
  lifeguard_info: string | null;
  lifeguard_info_source: BeachSource | null;
  sourced_notes: string | null;
  sourced_notes_source: BeachSource | null;
}

export interface UpdateBeachDetailsInput {
  expected_content_version: number;
  access_route?: string | null;
  characteristics?: string | null;
  services?: string | null;
  best_season?: string | null;
  best_season_source_id?: string | null;
  lifeguard_info?: string | null;
  lifeguard_info_source_id?: string | null;
}

/** Chi tiết bãi cho màn quản trị — đọc được cả khi place còn nháp. Trả null nếu chưa có hàng chi tiết. */
export async function getBeachDetailsAdmin(placeId: string, accessToken: string): Promise<BeachDetails | null> {
  return apiGetAuth<BeachDetails | null>(`/beaches/${encodeURIComponent(placeId)}/details`, accessToken, { cache: 'no-store' });
}

/** PATCH có CAS: `expected_content_version` là token places.content_version đang hiển thị. Trả thêm token mới. */
export async function updateBeachDetails(
  placeId: string,
  input: UpdateBeachDetailsInput,
  accessToken: string,
): Promise<BeachDetails & { content_version: number }> {
  return apiPatchAuth<BeachDetails & { content_version: number }>(`/beaches/${encodeURIComponent(placeId)}/details`, accessToken, input);
}

// Bug thiếu đã sửa (2026-10-11): `amenities` (bảng place_amenities dùng chung, cùng field tên này
// ở HotelDetail/RestaurantDetail) nay cũng được BeachesService.getBySlug() trả về — tách riêng
// khỏi beach_details vì amenities có thể có dữ liệu dù chưa từng tạo hàng place_beach_details nào
// (hai nguồn độc lập, không nên gộp điều kiện "có dữ liệu" của beach_details lên amenities).
export interface BeachPublicDetails {
  beach_details: BeachDetails | null;
  amenities: Amenity[];
}

/** Chi tiết bãi công khai (kèm beach_details + amenities) — dùng ở trang /places/[slug] khi category là beach. */
export async function getBeachPublicDetails(slug: string, locale: string = 'vi'): Promise<BeachPublicDetails> {
  const qs = new URLSearchParams({ locale });
  return apiGet<BeachPublicDetails>(`/beaches/${encodeURIComponent(slug)}?${qs.toString()}`, { cache: 'no-store' });
}
