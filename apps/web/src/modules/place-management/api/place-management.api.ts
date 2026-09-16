import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { GeoPoint, OpeningHours, PriceRangeValue } from '@phuquochub/shared-types';
import type { ManagedPlace, PlaceFormInput } from '../types';

// Client API Place Content Management (PLACE-041) — bốn endpoint: ba đã có sẵn từ trước
// (POST /places, PATCH /places/:id, DELETE /places/:id — Places module), một mới thêm trong task
// này (GET /places/mine). Cùng envelope/ApiError xử lý tập trung ở lib/http như moderation.api.ts.

/** GET /places/mine — địa điểm user hiện tại có quyền quản lý (Place.Edit.Managed). */
export async function listMyPlaces(accessToken: string): Promise<ManagedPlace[]> {
  return apiGetAuth<ManagedPlace[]>('/places/mine', accessToken, { cache: 'no-store' });
}

/** POST /places — tạo địa điểm mới (Place.Create, mở cho mọi thành viên đã đăng nhập). Trạng
 * thái khởi tạo luôn là `pending` (chờ kiểm duyệt) — KHÔNG tự cấp quyền quản lý cho người tạo,
 * xem PlacesService.listMine (places.service.ts) để biết vì sao. */
export async function createPlace(payload: PlaceFormInput, accessToken: string) {
  return apiPost<ManagedPlace>('/places', accessToken, payload);
}

/** PATCH /places/:id — sửa địa điểm đang quản lý (Place.Edit.Managed, phạm vi theo business_id). */
export async function updatePlace(id: string, payload: PlaceFormInput, accessToken: string) {
  return apiPatchAuth<ManagedPlace>(`/places/${encodeURIComponent(id)}`, accessToken, payload);
}

/** DELETE /places/:id — lưu trữ (archive). Trả `null` (EmptySuccess). Yêu cầu `Place.Archive` —
 * hiện chỉ moderator có quyền này (KHÔNG có biến thể `.Managed` cho business_manager/business_owner
 * trong seed permission hôm nay), nên gọi bằng tài khoản business sẽ nhận 403 — component gọi hàm
 * này PHẢI xử lý 403 rõ ràng, không giả định thành công. Xem báo cáo cuối task, mục Security Review. */
export async function archivePlace(id: string, accessToken: string): Promise<null> {
  return apiDeleteAuth<null>(`/places/${encodeURIComponent(id)}`, accessToken);
}

// Draft/publish + CAS cho các trường SCALAR (2026-09-17) — KHÔNG bao gồm name/short_description/
// description (i18n-overlaid, xem PlacesService.DRAFT_SCALAR_FIELDS's ghi chú đầy đủ) hay location
// (saveDraft() từ chối tường minh, chưa có CAS). Hai hàm dưới đây khớp `POST /places/:id/draft` +
// `POST /places/:id/revisions/:revisionId/publish` — xem PlaceForm capability table trong
// EditPlaceView.tsx để biết trường nào thật sự được bảo vệ.
export interface PlaceDraftScalarInput {
  category_id?: string;
  address?: string | null;
  ward?: string | null;
  price_range?: PriceRangeValue | null;
  opening_hours?: OpeningHours;
}

export async function saveDraftPlace(
  id: string,
  payload: PlaceDraftScalarInput,
  accessToken: string,
): Promise<{ id: string; revisionNumber: number }> {
  return apiPost(`/places/${encodeURIComponent(id)}/draft`, accessToken, payload);
}

export async function publishPlaceDraft(id: string, revisionId: string, accessToken: string): Promise<ManagedPlace> {
  return apiPost<ManagedPlace>(
    `/places/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}/publish`,
    accessToken,
  );
}

/**
 * Các trường KHÔNG có CAS (2026-09-17): `name`/`short_description` (i18n-overlaid, chưa có
 * draft/publish an toàn nào được xây — KHÁC `description` đã có nút ✏️ trên trang công khai) và
 * `location` (saveDraft() từ chối tường minh). Vẫn ghi trực tiếp qua PATCH /places/:id như hành vi
 * cũ — KHÔNG phải một hồi quy mới, chỉ thu hẹp lại đúng phạm vi của đường ghi không bảo vệ này sau
 * khi category/ward/address/price_range/opening_hours đã chuyển sang saveDraftPlace/publishPlaceDraft.
 */
export interface PlaceLegacyFieldsInput {
  name: string;
  short_description: string | null;
  location: GeoPoint;
}

export async function updatePlaceLegacyFields(
  id: string,
  payload: PlaceLegacyFieldsInput,
  accessToken: string,
): Promise<ManagedPlace> {
  return apiPatchAuth<ManagedPlace>(`/places/${encodeURIComponent(id)}`, accessToken, payload);
}
