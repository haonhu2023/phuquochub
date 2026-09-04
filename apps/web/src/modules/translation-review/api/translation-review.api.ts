import { apiGetAuth, apiPost } from '@/lib/http';
import type { ListReviewQueueParams, ReviewTranslationRequest, TranslationReviewQueueItem } from '../types';

// Client API cho Human Translation Review. Envelope + ApiError xử lý tập trung ở fetchEnvelope
// (apps/web/src/lib/http.ts) — nơi gọi chỉ bắt ApiError.status (403 quyền, 404 không tồn tại, 409
// stale/đã xử lý — xem TranslationReviewDecisionForm.tsx).

function buildQueueQuery(params: ListReviewQueueParams): string {
  const qs = new URLSearchParams();
  if (params.placeId) qs.set('placeId', params.placeId);
  if (params.placeSlug) qs.set('placeSlug', params.placeSlug);
  if (params.localeCode) qs.set('localeCode', params.localeCode);
  if (params.fieldKey) qs.set('fieldKey', params.fieldKey);
  if (params.limit) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /admin/place-translations/review-queue — bản dịch đang chờ duyệt (PlaceTranslation.Review.Any). */
export async function listReviewQueue(
  params: ListReviewQueueParams,
  accessToken: string,
): Promise<TranslationReviewQueueItem[]> {
  return apiGetAuth<TranslationReviewQueueItem[]>(
    `/admin/place-translations/review-queue${buildQueueQuery(params)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

/**
 * POST /admin/place-translations/{id}/review — trả `null` (EmptySuccess), giống
 * decideModerationCase. Không có phản hồi lạc quan: cha luôn nạp lại hàng chờ sau khi thành công.
 * ApiError.status phân biệt 403 (thiếu quyền)/404 (không tồn tại)/409 (đã bị duyệt/sửa bởi người
 * khác — xem TranslationReviewService.reviewTranslation() ở BE)/400 (thiếu ghi chú bắt buộc).
 */
export async function reviewTranslation(
  id: string,
  body: ReviewTranslationRequest,
  accessToken: string,
): Promise<null> {
  return apiPost<null>(`/admin/place-translations/${encodeURIComponent(id)}/review`, accessToken, body);
}
