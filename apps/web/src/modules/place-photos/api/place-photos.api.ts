import { apiDeleteAuth, apiGetAuth, apiPost } from '@/lib/http';
import type { PresignResult } from '@/modules/media/uploadPipeline';
import type { PlacePhoto } from '../types';

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
): Promise<PlacePhoto> {
  return apiPost<PlacePhoto>(`/places/${encodeURIComponent(placeId)}/media`, accessToken, { key });
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
