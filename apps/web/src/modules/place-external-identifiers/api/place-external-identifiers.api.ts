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
  // BẮT BUỘC — ID đã đọc/đối chiếu, không phải "ID hiện tại theo server" (xem ghi chú đầy đủ ở
  // apps/api ConfirmGooglePlaceIdDto). Caller luôn truyền `current.external_id` vừa tải, KHÔNG tự
  // suy đoán.
  expected_external_id: string;
  source_id?: string;
  evidence_id?: string;
}

export interface RevokeGooglePlaceIdVerificationInput {
  expected_external_id: string;
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
// `PlaceExternalIdentifier.Verify` (KHÁC Place.Edit.Managed) — 403 nếu người gọi KHÔNG giữ quyền
// đó (vd một business_manager chỉ giữ Place.Edit.Managed). KHÔNG phải cơ chế duyệt hai người độc
// lập — `content_owner` giữ cả hai permission, được phép tự nhập rồi tự xác nhận ở MVP này. Server
// luôn tự đặt verified_at; client KHÔNG gửi được giá trị đó. `expected_external_id` lệch so với ID
// hiện tại ở server → 409 (ai đó đã đổi ID từ lúc người xác nhận đọc/đối chiếu).
export async function confirmGooglePlaceId(
  placeId: string,
  payload: ConfirmGooglePlaceIdInput,
  accessToken: string,
): Promise<ExternalIdentifier> {
  return apiPost<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places/confirm`, accessToken, payload);
}

// Thu hồi xác nhận — cùng quyền với confirm, cùng cơ chế `expected_external_id` → 409 khi lệch.
// KHÔNG xoá identifier, chỉ đưa verified_at về null (public tự quay lại link tìm kiếm fallback).
export async function revokeGooglePlaceIdVerification(
  placeId: string,
  payload: RevokeGooglePlaceIdVerificationInput,
  accessToken: string,
): Promise<ExternalIdentifier> {
  return apiPost<ExternalIdentifier>(`/places/${encodeURIComponent(placeId)}/external-identifiers/google-places/revoke`, accessToken, payload);
}
