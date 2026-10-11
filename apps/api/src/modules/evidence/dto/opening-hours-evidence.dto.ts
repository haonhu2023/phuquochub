import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SourceType } from '../../sources/sources.enums';
import { OFFICIAL_SOURCE_TYPES } from '../evidence-trust';
import { EvidenceReviewDecision } from '../entities/evidence-review.entity';
import { ScheduleStability } from '../policy/opening-hours-official-stable-v1.policy';

const OFFICIAL_SOURCE_TYPE_VALUES = [...OFFICIAL_SOURCE_TYPES];
const SCHEDULE_STABILITY_VALUES: ScheduleStability[] = ['STABLE', 'TEMPORARY'];
const REVIEW_DECISION_VALUES: EvidenceReviewDecision[] = ['APPROVE', 'NEEDS_CHANGES', 'REJECT'];

// Minh hoạ cho người nhập: nguồn phải thuộc đúng tập OFFICIAL_SOURCE_TYPES (trang web chính thức /
// chủ cơ sở tự công bố / cơ quan nhà nước) — cùng tập evidence-trust.ts đã dùng cho gate, không bịa
// thêm loại nguồn nào khác chỉ cho luồng này. KHÔNG cho chọn FACEBOOK/COMMUNITY/AI/... ở đây: những
// loại đó không bao giờ qua được OPENING_HOURS_OFFICIAL_STABLE_V1 (SOURCE_NOT_FIRST_PARTY), nên
// chặn ngay ở DTO thay vì để người nhập nộp một thứ chắc chắn sẽ bị từ chối ở bước duyệt.
export class SubmitOpeningHoursEvidenceDto {
  @IsIn(OFFICIAL_SOURCE_TYPE_VALUES)
  source_type!: SourceType;

  @IsString() @MinLength(1) @MaxLength(500)
  source_url!: string;

  @IsOptional() @IsString() @MaxLength(200)
  source_title?: string;

  @IsOptional() @IsString() @MaxLength(200)
  source_publisher?: string;

  // Nội dung THẬT đã xem được tại nguồn (chép lại nguyên văn giờ mở cửa ghi trên nguồn đó) — đây là
  // "nội dung bằng chứng" được hash làm contentHashSha256; không phải mô tả/diễn giải của người nhập.
  @IsString() @MinLength(1) @MaxLength(4000)
  observed_text!: string;

  // Mặc định "vừa xem xong" (now) nếu bỏ trống — cho phép khai lùi ngày nếu người nhập xem nguồn
  // sớm hơn lúc nộp, nhưng vẫn phải còn trong hạn 168 giờ TẠI THỜI ĐIỂM DUYỆT (policy V1 rule 1),
  // không phải tại thời điểm nộp — nộp sớm rồi để treo lâu vẫn có thể hết hạn trước khi duyệt.
  @IsOptional() @IsISO8601()
  captured_at?: string;

  @IsIn(SCHEDULE_STABILITY_VALUES)
  schedule_stability!: ScheduleStability;
}

export class ReviewOpeningHoursEvidenceDto {
  @IsIn(REVIEW_DECISION_VALUES)
  decision!: EvidenceReviewDecision;

  // Người duyệt tự xác nhận lại tính ổn định của lịch (không mặc định lấy nguyên khai báo của người
  // nộp — đây chính là phần "con người xét lại", không phải chỉ ký nhận lại một trường đã có).
  @IsIn(SCHEDULE_STABILITY_VALUES)
  schedule_stability!: ScheduleStability;

  @IsOptional() @IsString() @MaxLength(2000)
  review_note?: string;
}
