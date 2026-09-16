import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const CONTACT_TYPES = [
  'HOTLINE', 'PHONE', 'EMAIL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'ZALO', 'YOUTUBE', 'OTHER',
];

export class CreateContactDto {
  @IsString() @IsIn(CONTACT_TYPES)
  contact_type!: string;

  @IsString() @MaxLength(300)
  value!: string;

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;

  @IsOptional() @IsInt()
  display_order?: number;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @IsIn(CONTACT_TYPES)
  contact_type?: string;

  @IsOptional() @IsString() @MaxLength(300)
  value?: string;

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;

  @IsOptional() @IsInt()
  display_order?: number;

  // CAS (2026-09-16) — TUỲ CHỌN. Khi có, ContactsService.update() chỉ áp thay đổi nếu
  // contact.updated_at vẫn khớp đúng giá trị này (409 nếu đã trôi). Không gửi = hành vi ghi trực
  // tiếp như trước (không đổi client cũ).
  @IsOptional() @IsISO8601()
  expected_updated_at?: string;
}
