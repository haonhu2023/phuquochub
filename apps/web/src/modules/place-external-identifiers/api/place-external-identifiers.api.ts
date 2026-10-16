import { apiGetAuth, apiPost, apiPutAuth } from '@/lib/http';

// Khớp PlaceExternalIdentifiersService.toResponse() (apps/api) — snake_case, cùng hình dạng ở mọi
// route (list/upsert/confirm/revoke). `verified_at` khác null CHỈ sau khi một actor giữ quyền
// `PlaceExternalIdentifier.Verify` gọi route confirm — KHÔNG đổi chỉ vì vừa nhập/sửa ID qua route
// upsert (xem ghi chú đầy đủ ở apps/api place-external-identifiers.service.ts).
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

export interface ConfirmGooglePlaceIdInput {
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
// tạo hàng thứ hai; xem apps/api upsertPrimaryGooglePlaceId()'s ghi chú đầy đủ). Đòi
// Place.Edit.Managed — người quản lý place được nhập/sửa ID họ đề xuất.
export async function upsertGooglePlaceId(
  placeId: string,
  payload: UpsertGooglePlaceIdInput,
  accessToken: string,
): Promise<ExternalIdentifier> {
  return apiPutAuth<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places`, accessToken, payload);
}

// Xác nhận hồ sơ Google khớp địa điểm (2026-10-16) — đòi quyền RIÊNG
// `PlaceExternalIdentifier.Verify` (KHÁC Place.Edit.Managed) — 403 nếu người gọi chỉ là người
// quản lý place (chính người nhập ID không tự xác nhận được). Server luôn tự đặt verified_at;
// client KHÔNG gửi được giá trị đó.
export async function confirmGooglePlaceId(
  placeId: string,
  payload: ConfirmGooglePlaceIdInput,
  accessToken: string,
): Promise<ExternalIdentifier> {
  return apiPost<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places/confirm`, accessToken, payload);
}

// Thu hồi xác nhận — cùng quyền với confirm. KHÔNG xoá identifier, chỉ đưa verified_at về null
// (public tự quay lại link tìm kiếm fallback).
export async function revokeGooglePlaceIdVerification(placeId: string, accessToken: string): Promise<ExternalIdentifier> {
  return apiPost<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places/revoke`, accessToken, {});
}
