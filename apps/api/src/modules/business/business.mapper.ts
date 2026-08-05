import { BusinessClaim } from './entities/business-claim.entity';
import type { BusinessClaimEvidenceItem } from './business-claim-evidence';

// Khớp data-dictionary snake_case, cùng quy ước `moderation.mapper.ts`. Summary (hàng đợi + phản
// hồi submit/withdraw) CỐ Ý KHÔNG có `evidence` — business.md §2 "riêng tư, chỉ Moderator"; chỉ
// Detail (đọc bởi actor đã qua `Business.Verify`, PHASE 7) mới lộ nó.
export interface BusinessClaimSummaryResponse {
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

export function toBusinessClaimSummary(c: BusinessClaim): BusinessClaimSummaryResponse {
  return {
    id: c.id,
    place_id: c.placeId,
    requester_id: c.requesterId,
    status: c.status,
    reviewer_id: c.reviewerId,
    reason_code: c.reasonCode,
    decision_note: c.decisionNote,
    decided_at: c.decidedAt ? c.decidedAt.toISOString() : null,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export interface BusinessClaimDetailResponse extends BusinessClaimSummaryResponse {
  evidence: BusinessClaimEvidenceItem[];
}

// Chỉ gọi từ đường ĐÃ qua `Business.Verify` (BusinessClaimsController.getById) — evidence riêng
// tư không bao giờ lộ ra đường công khai/requester.
export function toBusinessClaimDetail(c: BusinessClaim): BusinessClaimDetailResponse {
  return {
    ...toBusinessClaimSummary(c),
    evidence: c.evidence,
  };
}
