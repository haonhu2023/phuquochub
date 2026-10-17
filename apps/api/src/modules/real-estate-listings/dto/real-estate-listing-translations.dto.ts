import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Lưu DRAFT bản dịch — CHỈ 4 trường văn bản dịch được cho BĐS (khác job_listings): title/
// description/utilities_note/legal_status_note. KHÔNG có giá/diện tích/liên hệ/toạ độ/địa chỉ —
// dùng CHUNG, không nhân đôi.
export class UpsertRealEstateListingTranslationDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  utilities_note?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  legal_status_note?: string | null;

  @IsOptional() @IsInt() @Min(1)
  expected_content_version?: number;
}

export class DecideRealEstateListingTranslationDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @IsOptional() @IsInt() @Min(1)
  expected_content_version?: number;
}
