import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import type { ModerationTargetPreview } from './moderation-target-preview';

// M2 (GET /moderation/cases, GET /moderation/cases/{id}). Khớp data-dictionary snake_case
// (README §Ghi chú), cùng quy ước `bookings.mapper.ts`.
//
// CỐ Ý loại trừ khỏi CẢ hai response: `ai_score`/`ai_labels` — cột đã tồn tại trên entity (ADR-009)
// nhưng M2 nằm ngoài phạm vi AI theo chỉ đạo milestone; sẽ thêm khi M6/M7 thực sự ghi vào các cột
// này, tránh mở bề mặt API cho một khả năng chưa xây.
export interface ModerationCaseSummaryResponse {
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

export function toModerationCaseSummary(c: ModerationCase): ModerationCaseSummaryResponse {
  return {
    id: c.id,
    target_type: c.targetType,
    target_id: c.targetId,
    status: c.status,
    source: c.source,
    severity: c.severity,
    priority: c.priority,
    report_count: c.reportCount,
    assigned_to: c.assignedTo,
    claimed_at: c.claimedAt ? c.claimedAt.toISOString() : null,
    decision: c.decision,
    reason: c.reason,
    resolved_by: c.resolvedBy,
    resolved_at: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

// Report gắn với case — reporter_id CÓ mặt (đúng thiết kế §12/security model: "Hàng chờ CHỈ hiện
// danh tính người báo cáo cho người có Moderation.Queue.View" — endpoint này BỊ chặn đúng quyền
// đó, nên hiện reporter_id ở đây không vi phạm gì; điều bị cấm là lộ nó ra bề mặt CHỦ NỘI DUNG
// nhìn thấy, một bề mặt hoàn toàn khác, không tồn tại trong M2). KHÔNG join `users` lấy tên/email
// người báo cáo — vượt quá field đã đặc tả (`report summary` chỉ có report), UUID là đủ cho M2.
export interface ModerationReportSummaryResponse {
  id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

export function toModerationReportSummary(r: Report): ModerationReportSummaryResponse {
  return {
    id: r.id,
    reporter_id: r.reporterId,
    reason: r.reason,
    description: r.description,
    status: r.status,
    created_at: r.createdAt.toISOString(),
  };
}

// Ảnh chụp target — hai nhánh CHỈ khớp field thật sự tồn tại cho loại đó (media KHÔNG có
// `rating`/`content`, review KHÔNG có `media_type`/`uploaded_by`) — không hợp nhất thành một
// object nhiều trường null, tránh caller phải đoán field nào có nghĩa cho target_type nào.
export type ModerationTargetPreviewResponse =
  | { found: false; target_type: string; target_id: string }
  | {
      found: true;
      target_type: 'media';
      target_id: string;
      media_type: string;
      status: string;
      uploaded_by: string | null;
      created_at: string;
      // Owner Place Photos — `null` với ảnh review/mồ côi (không gắn cơ sở nào).
      place_id: string | null;
      place_name: string | null;
      // URL xem ảnh CHO MODERATOR (`/media/{id}/moderation-file`, gác `Media.Moderate`). KHÔNG
      // phải URL công khai và KHÔNG phải địa chỉ object storage — không rò rỉ object_key/bucket.
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

export function toModerationTargetPreview(p: ModerationTargetPreview): ModerationTargetPreviewResponse {
  if (!p.found) {
    return { found: false, target_type: p.targetType, target_id: p.targetId };
  }
  if (p.targetType === 'media') {
    return {
      found: true,
      target_type: 'media',
      target_id: p.targetId,
      media_type: p.mediaType,
      status: p.status,
      uploaded_by: p.uploadedBy,
      created_at: p.createdAt.toISOString(),
      place_id: p.placeId,
      place_name: p.placeName,
      preview_url: p.previewUrl,
    };
  }
  return {
    found: true,
    target_type: 'review',
    target_id: p.targetId,
    status: p.status,
    rating: p.rating,
    content: p.content,
    place_id: p.placeId,
    user_id: p.userId,
    created_at: p.createdAt.toISOString(),
  };
}

export interface ModerationCaseDetailResponse extends ModerationCaseSummaryResponse {
  reports: ModerationReportSummaryResponse[];
  target_preview: ModerationTargetPreviewResponse;
}

export function toModerationCaseDetail(
  c: ModerationCase,
  reports: Report[],
  preview: ModerationTargetPreview,
): ModerationCaseDetailResponse {
  return {
    ...toModerationCaseSummary(c),
    reports: reports.map(toModerationReportSummary),
    target_preview: toModerationTargetPreview(preview),
  };
}
