import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RichDoc } from '@phuquochub/shared-types';
import { IsRichDoc } from '../../../common/rich-doc';
import { JobListingEmploymentType, JobListingSalaryPeriod, JobListingStatus } from '../job-listings.enums';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tạo/sửa tin (chủ tin). Chỉ hợp lệ khi tin đang draft/pending/rejected (kiểm ở service — "sửa nội dung
// trọng yếu của tin public" không đi qua DTO này, xem JobListingsService.update()'s ghi chú).
export class UpsertJobListingDto {
  @IsString() @MinLength(1) @MaxLength(200)
  employer_name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  employer_role?: string | null;

  @IsOptional() @IsUUID()
  place_id?: string | null;

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1) @MaxLength(80)
  job_category!: string;

  @IsOptional() @IsString() @MaxLength(80)
  ward?: string | null;

  @IsString() @MinLength(1) @MaxLength(300)
  work_location!: string;

  @IsEnum(JobListingEmploymentType)
  employment_type!: JobListingEmploymentType;

  @IsOptional() @IsNumber() @Min(0)
  salary_min?: number | null;

  @IsOptional() @IsNumber() @Min(0)
  salary_max?: number | null;

  @IsOptional() @IsBoolean()
  salary_negotiable?: boolean;

  @IsOptional() @IsString() @MaxLength(3)
  salary_currency?: string | null;

  @IsOptional() @IsEnum(JobListingSalaryPeriod)
  salary_period?: JobListingSalaryPeriod | null;

  @IsOptional() @IsString() @MaxLength(500)
  shift_info?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  requirements?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  benefits?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  // Gói D — key VẮNG MẶT (undefined) = "client này không biết/không đụng rich text"; key có mặt
  // (object HOẶC null) = GHI ĐÈ, authoritative, xem JobListingsService.applyDescription() cho quy
  // tắc nguồn-sự-thật đầy đủ. `@ValidateIf` để `null` đi qua (xoá có chủ đích) mà vẫn kiểm object
  // thật bằng @IsRichDoc khi có giá trị.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @IsRichDoc()
  description_rich?: RichDoc | null;

  @IsString() @MinLength(1) @MaxLength(30)
  contact_method!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  contact_value!: string;

  @IsOptional() @Matches(DATE_RE, { message: 'expires_at phải là YYYY-MM-DD' })
  expires_at?: string | null;
}

export class DecideJobListingDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class ListJobListingsQueryDto {
  @IsOptional() @IsString() @MaxLength(80)
  job_category?: string;

  @IsOptional() @IsString() @MaxLength(80)
  ward?: string;

  @IsOptional() @IsEnum(JobListingEmploymentType)
  employment_type?: JobListingEmploymentType;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;

  // Gói C §3 (17/10/2026) — thẻ tin trong danh sách công khai PHẢI hiện tiêu đề đúng locale (owner
  // chỉ ra đúng: trước đó chỉ chi tiết có overlay, danh sách vẫn hiện tiêu đề tiếng Việt dù đã có
  // bản dịch được duyệt — một nguồn nhầm lẫn thật). CHỈ overlay `title` (danh sách không hiện mô
  // tả dài) — xem JobListingsService.listPublic()'s ghi chú batch-fetch tránh N+1.
  @IsOptional() @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

// Gói C (17/10/2026) — `locale` TÙY CHỌN cho chi tiết công khai MỘT tin. Chỉ 'vi'/'en' (khớp đúng
// scope đã chốt, KHÔNG tái dùng `LocalesService`/`supported_locales` của places — xem ghi chú
// job-listings.service.ts's getPublicById()).
export class GetJobListingDetailQueryDto {
  @IsOptional() @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

// Màn hình quản lý TOÀN BỘ tin (admin) — khác ListJobListingsQueryDto (công khai, chỉ published).
export class AdminListJobListingsQueryDto {
  @IsOptional() @IsEnum(JobListingStatus)
  status?: JobListingStatus;

  @IsOptional() @IsUUID()
  created_by?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}
