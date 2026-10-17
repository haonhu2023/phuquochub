import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Lưu DRAFT bản dịch — CHỈ 4 trường văn bản dịch được (Gói C, khớp đúng field list owner đã chốt:
// title/description/requirements/benefits). KHÔNG có salary/contact/expires_at/... — những trường
// đó dùng CHUNG một bộ dữ liệu, không nhân đôi (owner yêu cầu rõ, xem checkpoint §Gói C).
export class UpsertJobListingTranslationDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  requirements?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  benefits?: string | null;
}

export class DecideJobListingTranslationDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}
