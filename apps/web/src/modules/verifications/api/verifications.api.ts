import { apiPost } from '@/lib/http';

// ADR-008 Verification Foundation — cơ chế xác minh CHUNG cho place/contact/price_history, đã có
// đủ ở backend (`/verifications`, `Verification.Verify`/`Reject`, moderator-only theo Owner
// Decision 2026-08-06) nhưng CHƯA có bất kỳ lời gọi frontend nào trước bản này. Hai hàm dưới đây
// chỉ bọc ĐÚNG hai bước submit + verify cho price_history — KHÔNG phải một hàng đợi moderator đầy
// đủ (claim/reject/vote/official vẫn chưa có UI, là một việc lớn hơn, cắt ngang cả place/contact,
// không riêng price).

/** POST /verifications {target_type:'price_history'} — đưa MỘT bản giá vào hàng đợi xác minh. */
export async function submitPriceVerification(
  priceId: string,
  accessToken: string,
  note?: string,
): Promise<{ id: string; status: string }> {
  return apiPost<{ id: string; status: string }>('/verifications', accessToken, {
    target_type: 'price_history',
    target_id: priceId,
    note,
  });
}

/**
 * POST /verifications/:id/verify — chuyển pending -> verified (Verification.Verify,
 * moderator-only). Không truyền `source_id`: xác nhận thủ công không kèm nguồn chính thức vẫn hợp
 * lệ ở mức `verified` (khác `official`, nơi `source_id` bắt buộc) — dùng đúng optionality đã khai
 * ở `VerifyDecisionDto` phía API, không tự đặt thêm ràng buộc.
 */
export async function verifyPriceVerification(
  verificationId: string,
  accessToken: string,
  note?: string,
): Promise<{ status: string }> {
  return apiPost<{ status: string }>(`/verifications/${encodeURIComponent(verificationId)}/verify`, accessToken, {
    note,
  });
}
