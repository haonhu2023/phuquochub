import { apiGetAuth, apiPutAuth } from '@/lib/http';

// Khớp PlaceExternalIdentifiersService.toResponse() (apps/api) — snake_case, cùng hình dạng dù
// qua list() hay upsertGooglePlaceId(). `verified_at` LUÔN null trên mọi identifier nhập qua route
// này (dashboard không có cách đánh dấu đã xác minh — xem ghi chú đầy đủ ở apps/api
// place-external-identifiers.service.ts's findVerifiedPrimaryGooglePlaceId).
export interface ExternalIdentifier {
  id: string;
  place_id: string;
  provider: 'GOOGLE_PLACES';
  external_id: string;
  is_primary: boolean;
  source_id: string | null;
  evidence_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertGooglePlaceIdInput {
  external_id: string;
  source_id?: string;
  evidence_id?: string;
}

// Dashboard-only (Place.Edit.Managed theo place đó — cùng quyền sửa place). KHÔNG public.
export async function getExternalIdentifiers(placeId: string, accessToken: string): Promise<ExternalIdentifier[]> {
  return apiGetAuth<ExternalIdentifier[]>(`/places/${encodeURIComponent(placeId)}/external-identifiers`, accessToken, {
    cache: 'no-store',
  });
}

// PUT — thay TOÀN BỘ identifier GOOGLE_PLACES của place này (sửa ID nhập sai → nhập lại, không
// tạo hàng thứ hai; xem apps/api upsertPrimaryGooglePlaceId()'s ghi chú đầy đủ).
export async function upsertGooglePlaceId(
  placeId: string,
  payload: UpsertGooglePlaceIdInput,
  accessToken: string,
): Promise<ExternalIdentifier> {
  return apiPutAuth<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places`, accessToken, payload);
}
