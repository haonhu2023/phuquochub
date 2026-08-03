import { ModerationCaseSeverity, ModerationCaseSource } from './moderation.enums';

// ADR-018 D1 (aggregation)/moderation-design.md §4.1 — module thuần, không phụ thuộc DB, cùng
// khuôn media-moderation.transition.ts/review-moderation.transition.ts. `severity` là phân loại
// LƯU TRỮ; `priority` suy ra XÁC ĐỊNH từ severity + report_count lúc ghi, không bao giờ nhập tay.
//
// Bảng "nâng severity" trong thiết kế là quy tắc NÂNG (raise-to-at-least), không phải gán tuyệt
// đối — một case đã ở severity cao hơn mức sàn của source/report_count KHÔNG bao giờ bị hạ xuống.
// Điều này cho phép ngoại lệ backfill (D14/O7 — new_content nhưng severity='normal' ngay lúc tạo,
// cao hơn sàn 'low' thường lệ của new_content) tự động được BẢO TOÀN qua computeSeverity() mà
// không cần hàm này biết gì về backfill: max(current='normal', floor('new_content')='low') = 'normal'.

const SEVERITY_ORDER: Record<ModerationCaseSeverity, number> = {
  [ModerationCaseSeverity.LOW]: 0,
  [ModerationCaseSeverity.NORMAL]: 1,
  [ModerationCaseSeverity.HIGH]: 2,
  [ModerationCaseSeverity.CRITICAL]: 3,
};

// §4.1 "Quy tắc nâng severity (áp lúc ghi)" — sàn tối thiểu theo source.
const SEVERITY_FLOOR_BY_SOURCE: Record<ModerationCaseSource, ModerationCaseSeverity> = {
  [ModerationCaseSource.NEW_CONTENT]: ModerationCaseSeverity.LOW,
  [ModerationCaseSource.MANUAL]: ModerationCaseSeverity.NORMAL,
  [ModerationCaseSource.REPORT]: ModerationCaseSeverity.NORMAL,
  // ai_flag + ai_score >= ngưỡng cứng -> critical (M7, chưa triển khai AI — không có đường nào
  // tạo case source=ai_flag hôm nay, nhưng sàn vẫn giữ đúng bảng thiết kế cho tính đầy đủ dữ liệu).
  [ModerationCaseSource.AI_FLAG]: ModerationCaseSeverity.CRITICAL,
};

function maxSeverity(a: ModerationCaseSeverity, b: ModerationCaseSeverity): ModerationCaseSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

/**
 * Tính severity MỚI sau khi một report vừa được ghi (T3 bước 4). `current`/`source` là của chính
 * case (đọc TRƯỚC khi tính, trong cùng transaction đã khoá — xem
 * `ModerationCasesRepository.findOpenCaseForTargetForUpdate`). `reportCount` là tổng SAU khi tăng
 * (report vừa ghi ĐÃ được tính), đúng thứ tự T3: INSERT report (bước 3) rồi mới recompute (bước 4).
 */
export function computeSeverity(
  current: ModerationCaseSeverity,
  source: ModerationCaseSource,
  reportCount: number,
): ModerationCaseSeverity {
  let result = maxSeverity(current, SEVERITY_FLOOR_BY_SOURCE[source]);
  // §4.1: report_count >= 3 -> severity tối thiểu 'high'. CHỈ đổi thứ tự hàng chờ (INV-6/O3) —
  // không có nhánh mã nào ở đây hay bất kỳ đâu đổi trạng thái hiển thị nội dung.
  if (reportCount >= 3) {
    result = maxSeverity(result, ModerationCaseSeverity.HIGH);
  }
  return result;
}

const PRIORITY_BASE: Record<ModerationCaseSeverity, number> = {
  [ModerationCaseSeverity.LOW]: 0,
  [ModerationCaseSeverity.NORMAL]: 10,
  [ModerationCaseSeverity.HIGH]: 30,
  [ModerationCaseSeverity.CRITICAL]: 60,
};

/**
 * `priority = base(severity) + min(5 × max(report_count − 1, 0), 25)` (§4.1, nguyên văn). Số
 * nguyên lưu sẵn — KHÔNG phải biểu thức tính lúc truy vấn, để hàng chờ luôn là một lần quét index
 * duy nhất (`idx_moderation_cases_queue`).
 */
export function computePriority(severity: ModerationCaseSeverity, reportCount: number): number {
  return PRIORITY_BASE[severity] + Math.min(5 * Math.max(reportCount - 1, 0), 25);
}
