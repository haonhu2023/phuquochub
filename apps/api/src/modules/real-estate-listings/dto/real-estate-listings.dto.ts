import { Type } from 'class-transformer';
import {
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
import {
  RealEstateAddressPrecision,
  RealEstateFurnitureStatus,
  RealEstateListingStatus,
  RealEstatePosterRole,
  RealEstatePropertyType,
  RealEstateRentPeriod,
  RealEstateSalePriceBasis,
  RealEstateTransactionType,
} from '../real-estate-listings.enums';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tạo/sửa tin — CHỈ các trường thực nhận. Trường theo giao dịch (rent_period/deposit_amount/...
// vs sale_price_basis/legal_status_note) được validate THEO transaction_type ở service
// (assertTransactionScopedFields) — DTO chỉ kiểm hình dạng từng field, không biết ngữ cảnh.
export class UpsertRealEstateListingDto {
  @IsEnum(RealEstatePosterRole)
  poster_role!: RealEstatePosterRole;

  @IsEnum(RealEstateTransactionType)
  transaction_type!: RealEstateTransactionType;

  @IsEnum(RealEstatePropertyType)
  property_type!: RealEstatePropertyType;

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(80)
  ward?: string | null;

  @IsOptional() @IsEnum(RealEstateAddressPrecision)
  address_precision?: RealEstateAddressPrecision;

  @IsOptional() @IsString() @MaxLength(300)
  address_text?: string | null;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  lat?: number | null;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  lng?: number | null;

  @IsOptional() @IsNumber() @Min(0)
  area_sqm?: number | null;

  @IsOptional() @IsNumber() @Min(0)
  price?: number | null;

  @IsOptional() @IsString() @MaxLength(3)
  price_currency?: string | null;

  @IsOptional() @IsEnum(RealEstateRentPeriod)
  rent_period?: RealEstateRentPeriod | null;

  @IsOptional() @IsEnum(RealEstateSalePriceBasis)
  sale_price_basis?: RealEstateSalePriceBasis | null;

  @IsOptional() @IsNumber() @Min(0)
  deposit_amount?: number | null;

  @IsOptional() @IsString() @MaxLength(500)
  utilities_note?: string | null;

  // Gói D — key VẮNG MẶT (undefined) = "không đụng rich text"; có mặt (object HOẶC null) = ghi đè
  // authoritative, xem apps/api/src/common/rich-text-field.ts's applyRichTextField() cho quy tắc
  // đầy đủ (dùng chung cho cả ba trường rich-text trong DTO này).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @IsRichDoc()
  utilities_note_rich?: RichDoc | null;

  @IsOptional() @IsEnum(RealEstateFurnitureStatus)
  furniture_status?: RealEstateFurnitureStatus | null;

  @IsOptional() @Matches(DATE_RE, { message: 'move_in_date phải là YYYY-MM-DD' })
  move_in_date?: string | null;

  @IsOptional() @IsInt() @Min(0)
  lease_term_months?: number | null;

  @IsOptional() @IsString() @MaxLength(500)
  legal_status_note?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  @IsRichDoc()
  legal_status_note_rich?: RichDoc | null;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

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

export class DecideRealEstateListingDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class ListRealEstateListingsQueryDto {
  @IsOptional() @IsEnum(RealEstateTransactionType)
  transaction_type?: RealEstateTransactionType;

  @IsOptional() @IsEnum(RealEstatePropertyType)
  property_type?: RealEstatePropertyType;

  @IsOptional() @IsString() @MaxLength(80)
  ward?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;

  // Gói C §3 (17/10/2026) — cùng lý do ListJobListingsQueryDto's `locale` (xem ghi chú ở đó).
  @IsOptional() @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

// Gói C (17/10/2026) — cùng lý do GetJobListingDetailQueryDto (xem ghi chú ở đó).
export class GetRealEstateListingDetailQueryDto {
  @IsOptional() @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

// Màn hình quản lý TOÀN BỘ tin (admin) — khác ListRealEstateListingsQueryDto (công khai, chỉ published).
export class AdminListRealEstateListingsQueryDto {
  @IsOptional() @IsEnum(RealEstateListingStatus)
  status?: RealEstateListingStatus;

  @IsOptional() @IsUUID()
  created_by?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}
