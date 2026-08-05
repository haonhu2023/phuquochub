// Enum cluster Business Claim — khớp ADR-015 §2-4, business.md, prisma/schema.prisma:192-211.

export enum ClaimStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISPUTED = 'disputed',
  WITHDRAWN = 'withdrawn',
}

export enum ClaimReasonCode {
  INSUFFICIENT_EVIDENCE = 'insufficient_evidence',
  DUPLICATE = 'duplicate',
  FRAUD = 'fraud',
  WRONG_TARGET = 'wrong_target',
  OTHER = 'other',
}

export enum MemberRole {
  OWNER = 'owner',
  MANAGER = 'manager',
}

// Giá trị `decision` hợp lệ cho POST /business-claims/{id}/decide (moderator). `dispute` KHÔNG
// nằm trong tập này — đó là kết quả TỰ ĐỘNG khi approve gặp owner hiệu lực đã tồn tại (business.md
// §4 nhánh "(đã có owner)"), không phải một lựa chọn thủ công của moderator. `withdraw` có endpoint
// riêng (requester, không phải Business.Verify) — xem business-claims.controller.ts.
export enum BusinessClaimDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}
