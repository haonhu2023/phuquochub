import { BusinessClaim } from './entities/business-claim.entity';
import type { BusinessClaimEvidenceItem } from './business-claim-evidence';
import type { ModeratorBusinessClaimRow, OwnBusinessClaimRow } from './repositories/business-claims.repository';

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

// GET /business-claims (hàng đợi moderator) — BusinessClaimSummaryResponse + ĐÚNG ba trường định
// danh người-đọc-được (xem `ModeratorBusinessClaimRow`: không có route tra place theo UUID nên
// hàng đợi không thể tự phân giải tên cơ sở). THÊM trường, không bỏ trường nào — response cũ vẫn
// là tập con hợp lệ. Vẫn KHÔNG có `evidence` (riêng tư, chỉ Detail).
export interface ModeratorBusinessClaimSummaryResponse extends BusinessClaimSummaryResponse {
  place_name: string;
  place_slug: string;
  requester_display_name: string;
}

export function toModeratorBusinessClaimSummary(
  row: ModeratorBusinessClaimRow,
): ModeratorBusinessClaimSummaryResponse {
  return {
    id: row.id,
    place_id: row.placeId,
    requester_id: row.requesterId,
    status: row.status,
    reviewer_id: row.reviewerId,
    reason_code: row.reasonCode,
    decision_note: row.decisionNote,
    decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    place_name: row.placeName,
    place_slug: row.placeSlug,
    requester_display_name: row.requesterDisplayName,
  };
}

export interface BusinessClaimDetailResponse extends ModeratorBusinessClaimSummaryResponse {
  evidence: BusinessClaimEvidenceItem[];
}

// Chỉ gọi từ đường ĐÃ qua `Business.Verify` (BusinessClaimsController.getById) — evidence riêng
// tư không bao giờ lộ ra đường công khai/requester. YÊU CẦU claim đã nạp kèm `place`/`requester`
// (BusinessClaimsRepository.findByIdWithRelations) — cùng ba trường định danh như hàng đợi, để màn
// hình duyệt không phải gọi thêm API nào chỉ để biết tên cơ sở.
export function toBusinessClaimDetail(c: BusinessClaim): BusinessClaimDetailResponse {
  return {
    ...toBusinessClaimSummary(c),
    place_name: c.place.name,
    place_slug: c.place.slug,
    requester_display_name: c.requester.displayName,
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
