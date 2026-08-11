import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';
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
