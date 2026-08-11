// Kiểu FE cho Moderation (M6 — Moderator UI). Wire format là snake_case (khớp
// moderation.mapper.ts của API); KHÔNG có type moderation nào trong @phuquochub/shared-types nên
// dùng module type FE cục bộ này (Phase 3). Các mảng `as const` phản chiếu ĐÚNG enum backend
// (moderation.enums.ts) — không phát minh giá trị mới, dùng chung cho filter + nhãn hiển thị.

export const MODERATION_CASE_STATUSES = ['open', 'claimed', 'resolved', 'dismissed'] as const;
export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUSES)[number];

export const MODERATION_TARGET_TYPES = ['review', 'media', 'place'] as const;
export type ModerationTargetType = (typeof MODERATION_TARGET_TYPES)[number];

export const MODERATION_SOURCES = ['new_content', 'report', 'ai_flag', 'manual'] as const;
export type ModerationCaseSource = (typeof MODERATION_SOURCES)[number];

export const MODERATION_SEVERITIES = ['low', 'normal', 'high', 'critical'] as const;
export type ModerationCaseSeverity = (typeof MODERATION_SEVERITIES)[number];

export const MODERATION_DECISIONS = ['approve', 'reject', 'hide', 'restore', 'dismiss'] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

// Đích restore của media (media_status thật) — chỉ published|pending hợp lệ (FSM backend chốt).
export const MEDIA_STATUSES = ['pending', 'published', 'hidden', 'rejected'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const REVIEW_STATUSES = ['pending', 'published', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REPORT_REASONS = [
  'spam',
  'misinformation',
  'offensive',
  'irrelevant',
  'copyright',
  'personal_info',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'upheld', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// ---- Response shapes (khớp moderation.mapper.ts) ----

export interface ModerationCaseSummary {
  id: string;
  target_type: string;
  target_id: string;
  status: string;
  source: string;
  severity: string;
  priority: number;
  report_count: number;
  assigned_to: string | null;
  claimed_at: string | null;
  decision: string | null;
  reason: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModerationReportSummary {
  id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

// Union theo target_type — CHỈ field thật của loại đó (media không có rating/content; review không
// có media_type/uploaded_by).
//
// Owner Place Photos (2026-08-11): media NAY CÓ `preview_url` (kênh `/media/{id}/moderation-file`,
// gác `Media.Moderate`) và `place_id`/`place_name`. Trước đây khối này chỉ hiện "Không có ảnh xem
// trước" — không thể kiểm duyệt một bức ảnh mà không nhìn thấy nó.
export type ModerationTargetPreview =
  | { found: false; target_type: string; target_id: string }
  | {
      found: true;
      target_type: 'media';
      target_id: string;
      media_type: string;
      status: string;
      uploaded_by: string | null;
      created_at: string;
      place_id: string | null;
      place_name: string | null;
      preview_url: string | null;
    }
  | {
      found: true;
      target_type: 'review';
      target_id: string;
      status: string;
      rating: number;
      content: string | null;
      place_id: string;
      user_id: string;
      created_at: string;
    };

export interface ModerationCaseDetail extends ModerationCaseSummary {
  reports: ModerationReportSummary[];
  target_preview: ModerationTargetPreview;
}

// ---- Request shapes ----

export interface ListModerationCasesParams {
  status?: ModerationCaseStatus;
  target_type?: ModerationTargetType;
  source?: ModerationCaseSource;
  severity?: ModerationCaseSeverity;
  assigned_to?: string;
  page?: number;
  limit?: number;
}

// POST /moderation/cases/{id}/decide — đúng 3 trường hợp đồng (moderation.dto.ts). `target_status`
// chỉ dùng khi decision=restore (media bắt buộc; review chỉ nhận 'published'); `reason` bắt buộc
// khi reject|hide (backend cưỡng chế — client validate để cải thiện UX, backend vẫn quyết định).
export interface DecideModerationCaseRequest {
  decision: ModerationDecision;
  target_status?: MediaStatus;
  reason?: string;
}
