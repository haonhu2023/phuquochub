import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
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
