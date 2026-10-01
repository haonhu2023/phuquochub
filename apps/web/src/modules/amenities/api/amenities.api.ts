import { apiGet, apiPutAuth } from '@/lib/http';
import type { Amenity } from '../types';

/** GET /amenities — toàn bộ từ điển (công khai), dùng cho admin UI chọn. */
export async function listAllAmenities(group?: string): Promise<Amenity[]> {
  const qs = group ? `?group=${encodeURIComponent(group)}` : '';
  return apiGet<Amenity[]>(`/amenities${qs}`, { cache: 'no-store' });
}

/** GET /places/:id/amenities — tiện ích ĐÃ GÁN cho một place (công khai — dùng chung public/admin). */
export async function listPlaceAmenities(placeId: string): Promise<Amenity[]> {
  return apiGet<Amenity[]>(`/places/${encodeURIComponent(placeId)}/amenities`, { cache: 'no-store' });
}

export interface UpdatePlaceAmenitiesResponse {
  amenities: Amenity[];
  content_version: number;
}

/**
 * PUT /places/:id/amenities — thay TOÀN BỘ gán tiện ích (Place.Edit.Managed). Mã không tồn tại
 * trong từ điển bị từ chối 400 rõ ràng ở backend (AmenitiesService.updateForPlace).
 *
 * `expectedContentVersion` (2026-09-30) — CAS thật, BẮT BUỘC: token `places.content_version` đọc
 * TRƯỚC KHI sửa (từ nơi gọi — thường là category-details editor liền kề, cùng place). Không khớp
 * -> 409 (ApiError.status), KHÔNG ghi gì. Response giờ trả `{amenities, content_version}` (không
 * còn mảng trần) để caller cập nhật token cho lần ghi tiếp theo.
 */
export async function updatePlaceAmenities(
  placeId: string,
  codes: string[],
  expectedContentVersion: number,
  accessToken: string,
): Promise<UpdatePlaceAmenitiesResponse> {
  return apiPutAuth<UpdatePlaceAmenitiesResponse>(`/places/${encodeURIComponent(placeId)}/amenities`, accessToken, {
    amenity_codes: codes,
    expected_content_version: expectedContentVersion,
  });
}
