import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BusinessClaimEvidenceType } from '../business-claim-evidence';
import { BusinessClaimDecision, ClaimReasonCode, ClaimStatus } from '../business.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BusinessClaimEvidenceItemDto {
  @IsEnum(BusinessClaimEvidenceType)
  type!: BusinessClaimEvidenceType;

  @IsString() @MaxLength(500)
  @Transform(trim)
  reference!: string;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  note?: string;
}

// POST /business-claims (WF-05 UC-B1) — `place_id` + evidence ĐÚNG hình dạng đã đặc tả
// (business.md §2 "giấy phép/hóa đơn/ảnh mặt tiền/xác minh SĐT"). `requester_id` KHÔNG có mặt ở
// đây — LUÔN lấy từ JWT (`user.sub`), không bao giờ tin từ body (main.ts `forbidNonWhitelisted`
// từ chối trường lạ, kể cả cố tình gửi requester_id).
export class SubmitBusinessClaimDto {
  @IsUUID('4')
  place_id!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BusinessClaimEvidenceItemDto)
  evidence!: BusinessClaimEvidenceItemDto[];
}

// GET /business-claims (moderator queue) — business.md §6 chỉ đặc tả lọc theo status (mặc định
// pending) + place_id; KHÔNG có tham số sort tuỳ chỉnh (thứ tự CỐ ĐỊNH created_at ASC, id ASC —
// cùng nguyên tắc ListModerationCasesQueryDto không cho client chọn lại thứ tự chưa được chốt).
export class ListBusinessClaimsQueryDto {
  @IsOptional() @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @IsOptional() @IsUUID('4')
  place_id?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

// POST /business-claims/{id}/decide (moderator, Business.Verify) — chỉ approve/reject: `dispute`
// là kết quả TỰ ĐỘNG (business.md §4 nhánh "đã có owner"), KHÔNG phải giá trị decision hợp lệ ở
// đây (business.enums.ts BusinessClaimDecision không có DISPUTE). `reason_code` bắt buộc khi
// decision=reject (CHECK ràng buộc ở CSDL + cưỡng chế lại ở service trước khi mở transaction).
export class DecideBusinessClaimDto {
  @IsEnum(BusinessClaimDecision)
  decision!: BusinessClaimDecision;

  @IsOptional() @IsEnum(ClaimReasonCode)
  reason_code?: ClaimReasonCode;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  decision_note?: string;
}
