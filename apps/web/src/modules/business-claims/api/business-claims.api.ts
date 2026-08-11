import { apiGetAuth, apiPost } from '@/lib/http';
import type { BusinessClaimSummary, OwnBusinessClaim, SubmitBusinessClaimInput } from '../types';

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
