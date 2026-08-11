// Kiểu FE cho Business Claim submission (PLACE-042). Wire format snake_case, khớp
// business.mapper.ts/business.dto.ts của API. KHÔNG có type BusinessClaim nào trong
// @phuquochub/shared-types (module Business không xuất bản kiểu dùng chung, khác Places) — dùng
// type FE cục bộ, cùng quy ước modules/moderation/types.ts.

// business-claim-evidence.ts (BusinessClaimEvidenceType) — không phát minh giá trị mới.
export const BUSINESS_CLAIM_EVIDENCE_TYPES = [
  'business_license',
  'invoice',
  'storefront_photo',
  'phone_verification',
  'other',
] as const;
export type BusinessClaimEvidenceType = (typeof BUSINESS_CLAIM_EVIDENCE_TYPES)[number];

export const EVIDENCE_TYPE_LABELS: Record<BusinessClaimEvidenceType, string> = {
  business_license: 'Giấy phép kinh doanh',
  invoice: 'Hoá đơn',
  storefront_photo: 'Ảnh mặt tiền',
  phone_verification: 'Xác minh số điện thoại',
  other: 'Khác',
};

// Gợi ý nội dung "reference" theo từng loại — reference là CHUỖI tự do (business-claim-evidence.ts:
// "media id đã upload, hoặc chuỗi tự do cho SĐT/tài liệu"), không có cơ chế tải ảnh trực tiếp trong
// MVP này (xem báo cáo cuối task, mục Evidence).
export const EVIDENCE_REFERENCE_HINTS: Record<BusinessClaimEvidenceType, string> = {
  business_license: 'Số giấy phép kinh doanh, hoặc liên kết/mô tả tài liệu.',
  invoice: 'Số hoá đơn, hoặc liên kết/mô tả tài liệu.',
  storefront_photo: 'Liên kết ảnh mặt tiền (nếu có sẵn), hoặc mô tả ngắn.',
  phone_verification: 'Số điện thoại liên hệ của cơ sở.',
  other: 'Mô tả bằng chứng bạn muốn cung cấp.',
};

// Khớp BusinessClaimEvidenceItemDto (business.dto.ts) — reference bắt buộc (maxLength 500),
// note tuỳ chọn (maxLength 300).
export interface BusinessClaimEvidenceInput {
  type: BusinessClaimEvidenceType;
  reference: string;
  note?: string;
}

// Khớp SubmitBusinessClaimDto — requester_id KHÔNG có ở đây (luôn lấy từ JWT phía backend).
export interface SubmitBusinessClaimInput {
  place_id: string;
  evidence: BusinessClaimEvidenceInput[];
}

// Khớp BusinessClaimSummaryResponse (business.mapper.ts) — response của POST /business-claims.
// CỐ Ý không có `evidence` (business.md §2: riêng tư, chỉ Moderator qua GET /business-claims/{id}).
export interface BusinessClaimSummary {
  id: string;
  place_id: string;
  requester_id: string;
  status: string;
  reviewer_id: string | null;
  reason_code: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}
