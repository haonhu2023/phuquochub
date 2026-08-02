// Khớp ADR-018 §D1/D9/D10 và moderation-design.md §6.1 (Moderation Foundation, M1).
// `target` (review/media/place) là ĐỦ 3 loại đã đăng ký FSM-hoặc-dự-trù trong ADR-018 D9/MR-4 —
// `place` có mặt trong enum nhưng M1–M7 KHÔNG triển khai FSM cho nó (§Ngoài phạm vi, ADR-018).

export enum ModerationTargetType {
  REVIEW = 'review',
  MEDIA = 'media',
  PLACE = 'place',
}

export enum ModerationCaseStatus {
  OPEN = 'open',
  CLAIMED = 'claimed',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ModerationCaseSource {
  NEW_CONTENT = 'new_content',
  REPORT = 'report',
  AI_FLAG = 'ai_flag',
  MANUAL = 'manual',
}

export enum ModerationCaseSeverity {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ModerationDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  HIDE = 'hide',
  RESTORE = 'restore',
  DISMISS = 'dismiss',
}

export enum ReportReason {
  SPAM = 'spam',
  MISINFORMATION = 'misinformation',
  OFFENSIVE = 'offensive',
  IRRELEVANT = 'irrelevant',
  COPYRIGHT = 'copyright',
  PERSONAL_INFO = 'personal_info',
  OTHER = 'other',
}

export enum ReportStatus {
  OPEN = 'open',
  UPHELD = 'upheld',
  DISMISSED = 'dismissed',
}
