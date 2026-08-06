import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VerificationReasonCode, VerificationTargetType, VerificationVoteChoice } from '../verification.enums';
import { VerificationStatus } from '../../places/place.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /verifications — gửi (hoặc gửi lại) MỘT target vào hàng đợi xác minh (ADR-008, Verification.
// Verify — moderator-only ở milestone này, xem Owner Decision 2026-08-06 mục 2). `target_type`/
// `target_id` ánh xạ tới ĐÚNG MỘT cột FK exclusive-arc ở service, không phải cột DB trực tiếp.
export class SubmitVerificationDto {
  @IsEnum(VerificationTargetType)
  target_type!: VerificationTargetType;

  @IsUUID('4')
  target_id!: string;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;
}

// GET /verifications (moderator queue) — cùng quy ước ListBusinessClaimsQueryDto: KHÔNG cho client
// chọn lại thứ tự (cố định priority DESC, created_at ASC — verification.md §4 "ưu tiên hàng đợi").
export class ListVerificationsQueryDto {
  @IsOptional() @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @IsOptional() @IsUUID('4')
  assigned_to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

// POST /verifications/{id}/claim — moderator nhận việc (verification.md §5D "nhận việc / đặt
// assigned_to, priority"). KHÔNG phải một status transition (không ghi verification_events) —
// chỉ cập nhật metadata hàng đợi, vẫn qua CAS lock_version (§5C) để tránh ghi đè `sla_due_at`/
// `priority` đồng thời với một transition khác đang chạy trên CÙNG dòng.
export class ClaimVerificationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3)
  priority?: number;

  @IsOptional() @IsDateString()
  sla_due_at?: string;
}

// POST /verifications/{id}/verify — pending|community_verified -> verified (Verification.Verify).
export class VerifyDecisionDto {
  @IsOptional() @IsUUID('4')
  source_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  confidence?: number;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;
}

// POST /verifications/{id}/official — pending|verified|community_verified -> official
// (Verification.Verify). `source_id` BẮT BUỘC (CHECK ck_verif_official_source, verification.md
// §4) + PHẢI thuộc nhóm nguồn chính thức (§7: business_owner/official_website/government) —
// cưỡng chế ở service (SourcesRepository.findById), KHÔNG diễn đạt được bằng CHECK vì phụ thuộc
// bảng khác. `expires_at` mặc định +12 tháng nếu bỏ trống (§10 mục 3); tường minh `null` chỉ được
// chấp nhận khi target KHÔNG phải price_history (price_history: expires_at bắt buộc, §7).
export class OfficialDecisionDto {
  @IsUUID('4')
  source_id!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  confidence?: number;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;

  @IsOptional() @IsDateString()
  expires_at?: string | null;
}

// POST /verifications/{id}/reject — * -> rejected (Verification.Reject). `reason_code` bắt buộc
// (CHECK ck_verif_rejected_reason) — cưỡng chế lại ở service TRƯỚC khi mở transaction, cùng quy
// ước DecideBusinessClaimDto/reject.
export class RejectDecisionDto {
  @IsEnum(VerificationReasonCode)
  reason_code!: VerificationReasonCode;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  rejected_reason?: string;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;
}

// POST /verifications/{id}/votes — Verification.Vote (local_guide + DAG descendants, xem
// SeedVerificationPermissions1720004100000). Đổi phiếu = gọi lại với `vote` khác — idempotent
// (uq_vote_user, §5C).
export class CastVoteDto {
  @IsEnum(VerificationVoteChoice)
  vote!: VerificationVoteChoice;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;
}
