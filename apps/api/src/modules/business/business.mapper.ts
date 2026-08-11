import { BusinessClaim } from './entities/business-claim.entity';
import type { BusinessClaimEvidenceItem } from './business-claim-evidence';
import type { OwnBusinessClaimRow } from './repositories/business-claims.repository';

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

// GET /business-claims/mine (requester tự xem claim của mình) — hình dạng HẸP HƠN
// BusinessClaimSummaryResponse: KHÔNG `requester_id` (luôn là "chính người gọi", thừa thông tin),
// KHÔNG `reviewer_id` (danh tính moderator, riêng tư), KHÔNG `decision_note` (ghi chú tự do của
// moderator — business.md §2 không xác nhận an toàn cho requester đọc). `reason_code` là enum có
// kiểm soát nên đủ an toàn để requester hiểu lý do bị từ chối — xem business-claims.repository.ts
// `listByRequester()` (evidence/reviewer_id/decision_note không hề được nạp từ CSDL ở đường này).
export interface OwnBusinessClaimSummaryResponse {
  id: string;
  place_id: string;
  place_name: string;
  place_slug: string;
  status: string;
  reason_code: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toOwnBusinessClaimSummary(row: OwnBusinessClaimRow): OwnBusinessClaimSummaryResponse {
  return {
    id: row.id,
    place_id: row.placeId,
    place_name: row.placeName,
    place_slug: row.placeSlug,
    status: row.status,
    reason_code: row.reasonCode,
    decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
