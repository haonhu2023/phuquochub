import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { PresignResult } from '@/modules/media/uploadPipeline';
import type { PlacePhoto, RegisteredPlacePhoto } from '../types';

// Ảnh của cơ sở (Owner Place Photos). MỌI endpoint đều nằm dưới `/places/{placeId}/…` — place id
// là ROUTE PARAM chứ không phải trường trong body, vì đó là điều kiện để backend cưỡng chế được
// quyền `Media.Upload.Managed` trên đúng cơ sở đó (xem place-media.controller.ts). Client KHÔNG
// bao giờ gửi place_id trong body.

/** Ảnh của cơ sở cho màn hình quản lý — MỌI trạng thái (pending/published/rejected/hidden). */
export async function listPlacePhotos(placeId: string, accessToken: string): Promise<PlacePhoto[]> {
  return apiGetAuth<PlacePhoto[]>(`/places/${encodeURIComponent(placeId)}/media`, accessToken, {
    cache: 'no-store',
  });
}

export async function presignPlacePhoto(
  placeId: string,
  input: { content_type: string; size: number; checksum_sha256: string },
  accessToken: string,
): Promise<PresignResult> {
  return apiPost<PresignResult>(`/places/${encodeURIComponent(placeId)}/media/presign`, accessToken, input);
}

export async function registerPlacePhoto(
  placeId: string,
  key: string,
  accessToken: string,
): Promise<RegisteredPlacePhoto> {
  return apiPost<RegisteredPlacePhoto>(`/places/${encodeURIComponent(placeId)}/media`, accessToken, {
    key,
  });
}

/**
 * Sắp xếp lại ảnh của cơ sở. `mediaIds` phải là DANH SÁCH ĐẦY ĐỦ ảnh hiện có (mọi trạng thái),
 * đúng thứ tự mong muốn — backend từ chối danh sách thiếu/trùng/lẫn ảnh cơ sở khác. Trả về danh
 * sách SAU KHI sắp, nên gọi xong là có ngay trạng thái chuẩn của server, không cần tải lại.
 */
export async function reorderPlacePhotos(
  placeId: string,
  mediaIds: string[],
  accessToken: string,
): Promise<PlacePhoto[]> {
  return apiPatchAuth<PlacePhoto[]>(`/places/${encodeURIComponent(placeId)}/media/order`, accessToken, {
    media_ids: mediaIds,
  });
}

/** Đặt ảnh bìa. Gửi MEDIA ID (không bao giờ gửi URL) — xem place-media.controller.ts. */
export async function setPlacePhotoCover(
  placeId: string,
  mediaId: string,
  accessToken: string,
): Promise<PlacePhoto[]> {
  return apiPatchAuth<PlacePhoto[]>(`/places/${encodeURIComponent(placeId)}/media/cover`, accessToken, {
    media_id: mediaId,
  });
}

/**
 * Sửa mô tả (caption) / văn bản thay thế (alt_text) của MỘT ảnh. Cả hai trường độc lập tuỳ chọn —
 * bỏ qua một trường (`undefined`) giữ nguyên giá trị cũ ở backend; gửi chuỗi rỗng xoá mô tả đó.
 * Backend yêu cầu ÍT NHẤT MỘT trường có mặt. Trả về danh sách ảnh SAU khi sửa (cùng hình dạng GET).
 */
export async function updatePlacePhotoMetadata(
  placeId: string,
  mediaId: string,
  input: { caption?: string; alt_text?: string },
  accessToken: string,
): Promise<PlacePhoto[]> {
  return apiPatchAuth<PlacePhoto[]>(
    `/places/${encodeURIComponent(placeId)}/media/${encodeURIComponent(mediaId)}`,
    accessToken,
    input,
  );
}

/** Gỡ ảnh khỏi cơ sở (xoá mềm phía backend). */
export async function deletePlacePhoto(
  placeId: string,
  mediaId: string,
  accessToken: string,
): Promise<null> {
  return apiDeleteAuth<null>(
    `/places/${encodeURIComponent(placeId)}/media/${encodeURIComponent(mediaId)}`,
    accessToken,
  );
}
