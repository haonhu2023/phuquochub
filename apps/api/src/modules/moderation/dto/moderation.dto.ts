import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
} from '../moderation.enums';
import { MediaStatus } from '../../media/media.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GET /moderation/cases (M2, ADR-018/moderation-design.md §9) — CHỈ 5 filter đã tài liệu hoá
// (status/target_type/source/severity/assigned_to) + phân trang. KHÔNG sort_by/sort_dir: không
// có tham số sort nào được đặc tả cho hàng chờ kiểm duyệt (khác ListBookingsQueryDto) — thứ tự
// LUÔN CỐ ĐỊNH theo §4 (priority DESC, report_count DESC, created_at ASC, id ASC tie-break),
// không cho client chọn lại (tránh phát minh hợp đồng chưa được chốt).
export class ListModerationCasesQueryDto {
  // Bỏ trống -> mặc định hàng chờ (open+claimed), đúng định nghĩa "hàng chờ" ở thiết kế §4.
  // Truyền tường minh -> lọc đúng MỘT trạng thái đó (kể cả resolved/dismissed, phục vụ xem lịch sử
  // một case cụ thể qua idx_moderation_cases_target).
  @IsOptional() @IsEnum(ModerationCaseStatus)
  status?: ModerationCaseStatus;

  @IsOptional() @IsEnum(ModerationTargetType)
  target_type?: ModerationTargetType;

  @IsOptional() @IsEnum(ModerationCaseSource)
  source?: ModerationCaseSource;

  @IsOptional() @IsEnum(ModerationCaseSeverity)
  severity?: ModerationCaseSeverity;

  @IsOptional() @IsUUID('4')
  assigned_to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

// POST /moderation/cases/{id}/decide (M3, ADR-018/moderation-design.md §9.1) — request body ĐÚNG
// 3 trường đã đặc tả, không hơn. `dismiss` cũng là một `decision` hợp lệ (case ->dismissed, KHÔNG
// đổi trạng thái nội dung — §5.1) nên nằm chung enum, không tách route riêng.
//
// `reason` bắt buộc khi decision=reject|hide (INV-11) và `target_status` bắt buộc khi
// decision=restore (INV-10) — CẢ HAI là quy tắc nghiệp vụ phụ thuộc `decision`, class-validator
// không diễn đạt tốt điều kiện chéo kiểu này bằng decorator (khác `IsAfter` của bookings.dto.ts,
// vốn là quan hệ CẤU TRÚC thật giữa hai ngày). Cưỡng chế ở ModerationService.decide() — nơi FSM
// (`assertValidMediaTransition`) đã được gọi, tránh trùng lặp logic transition ở hai chỗ.
export class DecideModerationCaseDto {
  @IsEnum(ModerationDecision)
  decision!: ModerationDecision;

  // Chỉ published|pending thực sự hợp lệ (đích restore duy nhất của media) — FSM tự từ chối giá
  // trị khác hai giá trị đó với thông báo rõ ràng; DTO chỉ xác nhận đây LÀ một media_status thật.
  @IsOptional() @IsEnum(MediaStatus)
  target_status?: MediaStatus;

  @IsOptional() @IsString() @MaxLength(2000)
  @Transform(trim)
  reason?: string;
}
