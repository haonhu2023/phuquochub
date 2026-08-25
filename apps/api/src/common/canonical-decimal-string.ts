/**
 * Chuỗi thập phân canonical: chỉ chữ số ASCII, dương, KHÔNG leading zero — để một ID số có ĐÚNG
 * MỘT biểu diễn (hai chuỗi khác nhau cùng chỉ một ID sẽ làm so sánh allow-list ở D2 âm thầm
 * trượt). `"0"` bị từ chối vì GitHub numeric ID luôn dương, không bao giờ là 0.
 *
 * TRÍCH XUẤT (2026-08-25, Slice 0.5D2): trước ở `approval-evidence.contract.ts` (0.5D1), dạng
 * `const`/`function` không export. `approval-policy.contract.ts` (0.5D2) cần đúng logic canonical
 * này để validate ID trong `ApprovalEvidencePolicyV1`/`VerifiedAttestationFactsV1` — KHÔNG copy
 * regex sang D2 (Design Amendment 1, Correction A12). Dời ra `common/` cùng lý do đã áp dụng cho
 * `canonicalJson()` (0.5B) và `isValidCanonicalTimestamp()` (0.5D1): cắt vòng lặp import giữa hai
 * domain contract không nên phụ thuộc lẫn nhau. Hành vi và output giữ NGUYÊN BYTE-FOR-BYTE so với
 * bản gốc trong `approval-evidence.contract.ts` — chỉ đổi vị trí file. `approval-evidence.contract.ts`
 * giờ import lại từ đây; `validateApprovalEvidence()` không đổi hành vi.
 *
 * KHÔNG parse bằng `Number()`/`parseInt()`/`parseFloat()`/`BigInt()` ở bất kỳ đâu — một GitHub ID
 * có thể vượt `Number.MAX_SAFE_INTEGER` (2^53); parse sẽ làm mất độ chính xác. Hàm này CHỈ kiểm
 * HÌNH DẠNG chuỗi bằng regex, không bao giờ chuyển sang kiểu số.
 */
const CANONICAL_DECIMAL_STRING_RE = /^[1-9][0-9]*$/;

export function isCanonicalDecimalString(v: unknown): v is string {
  return typeof v === 'string' && CANONICAL_DECIMAL_STRING_RE.test(v);
}
