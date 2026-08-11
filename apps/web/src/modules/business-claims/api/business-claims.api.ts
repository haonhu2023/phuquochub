import { apiGetAuth, apiGetPaginatedAuth, apiPost } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  BusinessClaimSummary,
  DecideBusinessClaimRequest,
  ListBusinessClaimsParams,
  ModeratorBusinessClaim,
  ModeratorBusinessClaimDetail,
  OwnBusinessClaim,
  SubmitBusinessClaimInput,
} from '../types';

// Client API Business Claim submission (PLACE-042). Đúng MỘT endpoint dùng ở đây — POST đã có sẵn
// (BusinessClaimsController.submit, Business.Claim — mở cho mọi thành viên đã đăng nhập). Cùng
// envelope/ApiError xử lý tập trung ở lib/http như reviews.api.ts/place-management.api.ts.
export async function submitBusinessClaim(
  input: SubmitBusinessClaimInput,
  accessToken: string,
): Promise<BusinessClaimSummary> {
  return apiPost<BusinessClaimSummary>('/business-claims', accessToken, input);
}

/**
 * GET /business-claims/mine — claim CỦA CHÍNH người đang đăng nhập ("My Business Claims" dashboard).
 * KHÔNG có tham số nào ở client (không place/user id) — self-scope hoàn toàn quyết định bởi JWT ở
 * backend. Mảng phẳng, KHÔNG phân trang — cùng quy ước `listMyPlaces` (GET /places/mine).
 */
export async function listMyBusinessClaims(accessToken: string): Promise<OwnBusinessClaim[]> {
  return apiGetAuth<OwnBusinessClaim[]>('/business-claims/mine', accessToken, { cache: 'no-store' });
}

// ---------------------------------------------------------------------------
// Hàng đợi duyệt claim (Business.Verify — moderator). Ba endpoint ĐÃ CÓ SẴN ở
// BusinessClaimsController, chỉ chưa từng có client nào gọi. Cùng khuôn moderation.api.ts.
// ---------------------------------------------------------------------------

function buildClaimsQuery(params: ListBusinessClaimsParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.place_id) qs.set('place_id', params.place_id);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * GET /business-claims — hàng đợi duyệt (Business.Verify). Giữ `meta` cho phân trang.
 * Backend mặc định `status=pending` khi không truyền — không lặp lại mặc định đó ở client.
 */
export async function listBusinessClaims(
  params: ListBusinessClaimsParams,
  accessToken: string,
): Promise<{ data: ModeratorBusinessClaim[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<ModeratorBusinessClaim>(
    `/business-claims${buildClaimsQuery(params)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

/** GET /business-claims/{id} — claim + `evidence` riêng tư (Business.Verify). */
export async function getBusinessClaim(
  id: string,
  accessToken: string,
): Promise<ModeratorBusinessClaimDetail> {
  return apiGetAuth<ModeratorBusinessClaimDetail>(
    `/business-claims/${encodeURIComponent(id)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

/**
 * POST /business-claims/{id}/decide — approve|reject (Business.Verify). Trả claim đã cập nhật.
 * ApiError.status phân biệt 403 (kể cả tự duyệt claim của chính mình) / 404 / 422 (thiếu
 * reason_code khi reject, hoặc transition không hợp lệ vì claim đã được xử lý).
 */
export async function decideBusinessClaim(
  id: string,
  body: DecideBusinessClaimRequest,
  accessToken: string,
): Promise<BusinessClaimSummary> {
  return apiPost<BusinessClaimSummary>(
    `/business-claims/${encodeURIComponent(id)}/decide`,
    accessToken,
    body,
  );
}
