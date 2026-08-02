import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
} from '../moderation.enums';

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
