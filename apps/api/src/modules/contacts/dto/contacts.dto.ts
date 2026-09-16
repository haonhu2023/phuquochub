import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /**
   * CAS (2026-09-16, sửa lại 2026-09-17) — TUỲ CHỌN. Khi có, ContactsService.update() chỉ áp thay
   * đổi nếu `xmin::text` của dòng contact vẫn khớp đúng giá trị này (409 nếu đã trôi). Không gửi
   * = hành vi ghi trực tiếp như trước (không đổi client cũ).
   *
   * KHÔNG PHẢI timestamp (đổi tên từ `expected_updated_at`): một token lấy từ JS `Date` không bao
   * giờ khớp chính xác cột `updated_at` (timestamptz, độ phân giải micro-giây) — kể cả làm tròn về
   * mili-giây vẫn để lọt cửa sổ đua thật giữa hai ghi cùng mili-giây (lost update). `xmin` là mã
   * giao dịch Postgres đã ghi dòng này lần cuối — đổi ở MỌI lần UPDATE, không phụ thuộc đồng hồ hệ
   * thống, xem ContactsRepository.updateScalarsIfUnchanged()'s ghi chú đầy đủ.
   */
  @IsOptional() @IsString()
  expected_version?: string;
}
