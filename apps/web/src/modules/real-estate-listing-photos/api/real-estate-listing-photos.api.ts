import { apiDeleteAuth, apiGet, apiGetAuth, apiPost } from '@/lib/http';
import type { PresignResult } from '@/modules/media/uploadPipeline';
import type { RealEstateListingPhoto } from '../types';

// Mọi endpoint nằm dưới `/real-estate-listings/{listingId}/photos/…` — listing id là ROUTE PARAM,
// không phải trường trong body (cùng lý do place-photos.api.ts không gửi place_id trong body).

/** Ảnh công khai của một tin ĐANG công khai — không cần đăng nhập. */
export async function listRealEstateListingPhotos(listingId: string): Promise<RealEstateListingPhoto[]> {
  return apiGet<RealEstateListingPhoto[]>(`/real-estate-listings/${encodeURIComponent(listingId)}/photos`, {
    cache: 'no-store',
  });
}

/** Ảnh của tin cho CHỦ TIN — xem được ở bất kỳ trạng thái tin (nháp/chờ duyệt/đã đóng...). */
export async function listMyRealEstateListingPhotos(
  listingId: string,
  accessToken: string,
): Promise<RealEstateListingPhoto[]> {
  return apiGetAuth<RealEstateListingPhoto[]>(
    `/real-estate-listings/${encodeURIComponent(listingId)}/photos/mine`,
    accessToken,
    { cache: 'no-store' },
  );
}

export async function presignRealEstateListingPhoto(
  listingId: string,
  input: { content_type: string; size: number; checksum_sha256: string },
  accessToken: string,
): Promise<PresignResult> {
  return apiPost<PresignResult>(
    `/real-estate-listings/${encodeURIComponent(listingId)}/photos/presign`,
    accessToken,
    input,
  );
}

export async function registerRealEstateListingPhoto(
  listingId: string,
  key: string,
  accessToken: string,
): Promise<RealEstateListingPhoto> {
  return apiPost<RealEstateListingPhoto>(`/real-estate-listings/${encodeURIComponent(listingId)}/photos`, accessToken, {
    key,
  });
}

export async function deleteRealEstateListingPhoto(
  listingId: string,
  photoId: string,
  accessToken: string,
): Promise<null> {
  return apiDeleteAuth<null>(
    `/real-estate-listings/${encodeURIComponent(listingId)}/photos/${encodeURIComponent(photoId)}`,
    accessToken,
  );
}
