import { apiGetAuth, apiGetPaginatedAuth, apiPost } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  DecideModerationCaseRequest,
  ListModerationCasesParams,
  ModerationCaseDetail,
  ModerationCaseSummary,
} from '../types';

// Client API Moderation (M6). CHỈ 3 endpoint đã có (M2/M3/M4) — không thêm endpoint mới. Dùng
// helper Bearer sẵn có ở lib/http (apiGetAuth/apiGetPaginatedAuth thêm cho M6, apiPost đã có cho
// reviews). Envelope + ApiError xử lý tập trung ở fetchEnvelope — nơi gọi chỉ bắt ApiError.status.

function buildCasesQuery(params: ListModerationCasesParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.target_type) qs.set('target_type', params.target_type);
  if (params.source) qs.set('source', params.source);
  if (params.severity) qs.set('severity', params.severity);
  if (params.assigned_to) qs.set('assigned_to', params.assigned_to);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /moderation/cases — hàng chờ (Moderation.Queue.View). Giữ `meta` cho phân trang. */
export async function listModerationCases(
  params: ListModerationCasesParams,
  accessToken: string,
): Promise<{ data: ModerationCaseSummary[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<ModerationCaseSummary>(
    `/moderation/cases${buildCasesQuery(params)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

/** GET /moderation/cases/{id} — case + reports + ảnh chụp target (Moderation.Queue.View). */
export async function getModerationCase(
  id: string,
  accessToken: string,
): Promise<ModerationCaseDetail> {
  return apiGetAuth<ModerationCaseDetail>(`/moderation/cases/${encodeURIComponent(id)}`, accessToken, {
    cache: 'no-store',
  });
}

/**
 * POST /moderation/cases/{id}/decide — quyết định media/review. Trả `null` (EmptySuccess). Backend
 * chọn+kiểm quyền theo target_type của case (Media.Moderate/Review.Moderate) và cưỡng chế FSM;
 * ApiError.status phân biệt 403/404/409(stale)/422(transition/thiếu lý do/thiếu target_status).
 */
export async function decideModerationCase(
  id: string,
  body: DecideModerationCaseRequest,
  accessToken: string,
): Promise<null> {
  return apiPost<null>(`/moderation/cases/${encodeURIComponent(id)}/decide`, accessToken, body);
}
