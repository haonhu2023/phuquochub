import { apiDeleteAuth, apiGetAuth, apiGetPaginatedAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { GeoPoint, OpeningHours, PaginationMeta, PlaceCard, PriceRangeValue } from '@phuquochub/shared-types';
import type { ManagedPlace, PlaceFormInput, UpdatePlaceFormInput } from '../types';

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

/**
 * PATCH /places/:id — sửa địa điểm đang quản lý (Place.Edit.Managed — hoặc Place.Edit.Any cho
 * content_owner/biên tập viên toàn cục). Payload BẮT BUỘC mang `expected_content_version` (CAS,
 * AddPlaceContentVersion 2026-09-22) — token cũ → 409 (`ApiError.isConflict`), KHÔNG ghi đè.
 */
export async function updatePlace(id: string, payload: UpdatePlaceFormInput, accessToken: string) {
  return apiPatchAuth<ManagedPlace>(`/places/${encodeURIComponent(id)}`, accessToken, payload);
}

/**
 * GET /places/:id/preview — nội dung place CHƯA xuất bản, y hệt hình dạng sẽ hiện ra khi publish
 * (P3, 2026-09-22). Cùng permission với PATCH (Place.Edit.Managed/.Any) — dùng làm nguồn tải dữ
 * liệu form Sửa THAY CHO `listMyPlaces().find()`: listMine() chỉ liệt kê grant scope='managed' có
 * business_id cụ thể, nên content_owner (giữ Place.Edit.Any, business_id=null) không bao giờ xuất
 * hiện ở đó dù họ sửa/xuất bản được MỌI place qua đúng route PATCH này.
 */
export async function previewPlace(id: string, accessToken: string): Promise<ManagedPlace> {
  return apiGetAuth<ManagedPlace>(`/places/${encodeURIComponent(id)}/preview`, accessToken, { cache: 'no-store' });
}

/** POST /places/:id/approve — xuất bản (Place.Approve). Trả `null` (EmptySuccess). */
export async function publishPlace(id: string, accessToken: string): Promise<null> {
  return apiPost<null>(`/places/${encodeURIComponent(id)}/approve`, accessToken);
}

/**
 * POST /places/:id/unpublish — gỡ công khai về `draft` (Place.Approve). Trả `null` (EmptySuccess).
 * KHÁC archive(): hồi được — publishPlace() lại là đủ để công khai lại.
 */
export async function unpublishPlace(id: string, accessToken: string): Promise<null> {
  return apiPost<null>(`/places/${encodeURIComponent(id)}/unpublish`, accessToken);
}

/**
 * GET /places/editorial — MỌI place (mọi status), cho đội biên tập toàn cục (Place.Edit.Any).
 * Đây là màn "tìm thấy" cho content_owner: nơi DUY NHẤT họ thấy lại chính place họ vừa tạo
 * (`draft`) hay place `pending` của người khác — "Địa điểm của tôi" (listMyPlaces) không có gì.
 * Trả shape THẺ (PlaceCard — cùng `GET /places` công khai, qua toPlaceCard), KHÔNG phải chi tiết
 * đầy đủ: đủ cho danh sách (tên/slug/status/ảnh bìa), sửa/xuất bản mở trang riêng qua `id`.
 */
export async function listEditorialPlaces(
  accessToken: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ data: PlaceCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiGetPaginatedAuth<PlaceCard>(`/places/editorial${q ? `?${q}` : ''}`, accessToken);
}

/** DELETE /places/:id — lưu trữ (archive). Trả `null` (EmptySuccess). Yêu cầu `Place.Archive` —
 * hiện chỉ moderator có quyền này (KHÔNG có biến thể `.Managed` cho business_manager/business_owner
 * trong seed permission hôm nay), nên gọi bằng tài khoản business sẽ nhận 403 — component gọi hàm
 * này PHẢI xử lý 403 rõ ràng, không giả định thành công. Xem báo cáo cuối task, mục Security Review. */
export async function archivePlace(id: string, accessToken: string): Promise<null> {
  return apiDeleteAuth<null>(`/places/${encodeURIComponent(id)}`, accessToken);
}

// Draft/publish + CAS cho các trường SCALAR (2026-09-16, mở rộng `location` 2026-09-17) — KHÔNG
// bao gồm name/short_description/description (i18n-overlaid, xem PlacesService.DRAFT_SCALAR_FIELDS's
// ghi chú đầy đủ — ba trường đó đi qua saveNameDraft/saveShortDescriptionDraft/saveDescriptionDraft
// bên dưới thay vì đây). Hai hàm dưới đây khớp `POST /places/:id/draft` + `POST /places/:id/
// revisions/:revisionId/publish` — xem PlaceForm capability table trong EditPlaceView.tsx.
export interface PlaceDraftScalarInput {
  category_id?: string;
  address?: string | null;
  ward?: string | null;
  price_range?: PriceRangeValue | null;
  opening_hours?: OpeningHours;
  location?: GeoPoint;
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
