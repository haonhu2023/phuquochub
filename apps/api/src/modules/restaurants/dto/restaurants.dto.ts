import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';
import { PriceRange } from '../../places/place.enums';

export class MenuItemDto {
  @IsString() @MaxLength(160)
  name!: string;

  @IsOptional() @IsNumber() @Min(0)
  price?: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional()
  tags?: unknown;

  @IsOptional()
  sort_order?: number;
}

export class MenuSectionDto {
  @IsString() @MaxLength(120)
  name!: string;

  @IsOptional()
  sort_order?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items!: MenuItemDto[];
}

export class UpdateRestaurantMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuSectionDto)
  sections!: MenuSectionDto[];
}

export const RESTAURANT_SORT_VALUES = ['rating_desc', 'name_asc'] as const;
export type RestaurantSort = (typeof RESTAURANT_SORT_VALUES)[number];

// Query của `GET /api/restaurants` — công khai. `price_range`/`cuisine`/`sort`/`page`/`limit`
// thực sự lọc/sắp xếp ở repository; `open_now` đã KHAI trong openapi.yaml nhưng CHƯA triển khai
// (đánh giá "đang mở cửa" đúng cần so khớp opening_hours theo timezone/qua-đêm/ngày lễ — chưa có
// evaluator dùng chung nào trong repo, common/opening-hours.ts hiện chỉ validate CẤU TRÚC, không
// đánh giá thời điểm) — cố tình KHÔNG khai ở đây để `forbidNonWhitelisted` từ chối 400 thay vì
// âm thầm bỏ qua.
export class ListRestaurantsQueryDto {
  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;

  // `cuisine` là dữ liệu tham chiếu MỞ (bảng `cuisines`, seed được bổ sung theo thời gian) — KHÔNG
  // hardcode whitelist như CONTACT_TYPES (contacts.dto.ts): một code lạ/mới sẽ chỉ khớp 0 dòng ở
  // repository (an toàn), không nên bị từ chối 400 chỉ vì DTO chưa được cập nhật theo seed mới.
  @IsOptional() @IsString() @MaxLength(60)
  cuisine?: string;

  @IsOptional() @IsIn(RESTAURANT_SORT_VALUES)
  sort?: RestaurantSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
