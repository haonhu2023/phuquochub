import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PriceRange } from '../place.enums';
import { IsOpeningHours } from '../../../common/opening-hours';

export class GeoPointDto {
  // OD-F-1 (F1-C): hộp Phú Quốc là PROVISIONAL nên KHÔNG còn từ chối ở đây — toạ độ ngoài hộp
  // được chấp nhận và chỉ sinh tín hiệu kiểm toán ở PlacesService. Guard toàn cầu @IsNumber/
  // @Min/@Max GIỮ NGUYÊN và là thứ duy nhất còn từ chối: |lat|>90, |lng|>180, NaN.
  @IsNumber() @Min(-90) @Max(90)
  lat!: number;

  @IsNumber() @Min(-180) @Max(180)
  lng!: number;
}

export class CreatePlaceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsUUID()
  category_id!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  location!: GeoPointDto;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString() @MaxLength(300)
  short_description?: string;

  // @IsObject() giữ nguyên làm defense-in-depth; @IsOpeningHours thêm kiểm cấu trúc
  // theo SSOT places.md §4 (GAP-14) — trước đây mọi object đều lọt vào JSONB.
  @IsOptional() @IsObject() @IsOpeningHours()
  opening_hours?: Record<string, unknown>;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;
}

export class UpdatePlaceDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsUUID()
  category_id?: string;

  @IsOptional() @ValidateNested() @Type(() => GeoPointDto)
  location?: GeoPointDto;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString() @MaxLength(300)
  short_description?: string;

  // @IsObject() giữ nguyên làm defense-in-depth; @IsOpeningHours thêm kiểm cấu trúc
  // theo SSOT places.md §4 (GAP-14) — trước đây mọi object đều lọt vào JSONB.
  @IsOptional() @IsObject() @IsOpeningHours()
  opening_hours?: Record<string, unknown>;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;
}

// Query của `GET /api/places` — endpoint công khai (@Public).
// KHÔNG có `status`: lọc theo trạng thái là thao tác đặc quyền (sẽ lộ nội dung
// `draft`/`pending` chưa kiểm duyệt). Service luôn để repository dùng mặc định
// `published`. Hàng đợi kiểm duyệt cần endpoint riêng có kiểm tra quyền (Sprint 4).
// `whitelist + forbidNonWhitelisted` (main.ts) ⇒ gửi `?status=` sẽ bị từ chối 400.
export class ListPlacesQueryDto {
  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  ward?: string;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
