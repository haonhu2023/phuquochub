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

  // NHÃN KHU VỰC (vd `Dương Đông`) — KHÔNG phải đơn vị hành chính; đơn vị hành chính là
  // `province`/`admin_area` bên dưới.
  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  // Đơn vị hành chính, tách khỏi `ward` (Place Information Foundation, 2026-08-18).
  //
  // Cố ý là CHUỖI tự do có trần độ dài, KHÔNG phải enum: địa giới hành chính do pháp luật đổi
  // (Nghị quyết 1654/NQ-UBTVQH15 vừa nhập 2 phường + 6 xã của Phú Quốc thành MỘT đặc khu), nên
  // đóng cứng tập giá trị trong code nghĩa là mỗi lần sắp xếp lại đơn vị hành chính là một lần
  // phải deploy mới nhập được dữ liệu đúng. Trần độ dài khớp đúng cột DB.
  @IsOptional() @IsString() @MaxLength(120)
  province?: string;

  @IsOptional() @IsString() @MaxLength(120)
  admin_area?: string;

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

  /** Nhãn khu vực — xem ghi chú ở `CreatePlaceDto.ward`. */
  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  /** Đơn vị hành chính — xem ghi chú ở `CreatePlaceDto.province`. */
  @IsOptional() @IsString() @MaxLength(120)
  province?: string;

  @IsOptional() @IsString() @MaxLength(120)
  admin_area?: string;

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
