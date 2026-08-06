// Enum cluster Verification (ADR-008, verification.md §4). `VerificationStatus` KHÔNG lặp lại ở
// đây — dùng chung `VerificationStatus` từ `../places/place.enums` (cùng Postgres enum
// `verification_status` mà cache `places`/`contacts`/`price_history` đã dùng từ InitPlaces; xem
// migration InitVerifications1720004000000).

export enum VerificationMethod {
  MODERATOR = 'moderator',
  OWNER_CLAIM = 'owner_claim',
  SOURCE_MATCH = 'source_match',
  COMMUNITY_VOTE = 'community_vote',
  SYSTEM_AUTO = 'system_auto',
}

// §4.1 — mã lý do khi rejected (chuẩn hoá, phục vụ báo cáo/tuân thủ).
export enum VerificationReasonCode {
  DUPLICATE = 'duplicate',
  FABRICATED = 'fabricated',
  OUTDATED = 'outdated',
  INSUFFICIENT_EVIDENCE = 'insufficient_evidence',
  POLICY_VIOLATION = 'policy_violation',
  WRONG_TARGET = 'wrong_target',
  OTHER = 'other',
}

export enum VerificationVoteChoice {
  CONFIRM = 'confirm',
  DISPUTE = 'dispute',
}

// Target type cho API layer (exclusive arc ở DB — đúng một cột FK khác NULL); không phải ENUM
// Postgres, chỉ dùng để định tuyến DTO/service tới đúng cột/repository.
export enum VerificationTargetType {
  PLACE = 'place',
  CONTACT = 'contact',
  PRICE_HISTORY = 'price_history',
}
