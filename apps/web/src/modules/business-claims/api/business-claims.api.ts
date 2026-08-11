import { apiPost } from '@/lib/http';
import type { BusinessClaimSummary, SubmitBusinessClaimInput } from '../types';

// Client API Business Claim submission (PLACE-042). Đúng MỘT endpoint dùng ở đây — POST đã có sẵn
// (BusinessClaimsController.submit, Business.Claim — mở cho mọi thành viên đã đăng nhập). Cùng
// envelope/ApiError xử lý tập trung ở lib/http như reviews.api.ts/place-management.api.ts.
export async function submitBusinessClaim(
  input: SubmitBusinessClaimInput,
  accessToken: string,
): Promise<BusinessClaimSummary> {
  return apiPost<BusinessClaimSummary>('/business-claims', accessToken, input);
}
