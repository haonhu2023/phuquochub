import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
// CAS thật (2026-09-30) — xem ghi chú đầy đủ ở UpdateHotelDetailsDto: token `expected_content_version`
// tái dùng ĐÚNG `places.content_version` đã có, không dựng hệ version thứ hai cho satellite table.
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

  // "Món nổi bật" (product spec, 2026-09-29) — AddRestaurantMenuItemSignature.
  @IsOptional() @IsBoolean()
  is_signature?: boolean;

  @IsOptional()
  sort_order?: number;
}

// place_restaurant_details.is_local_specialty có DEFAULT false ở DB nên upsert không cần input bắt
// buộc (khác hotel_type NOT NULL không default) — vẫn cùng lý do UPSERT: hàng này không được tạo
// tự động khi một place category='restaurant' ra đời.
export class UpdateRestaurantDetailsDto {
  @IsInt() @Min(0)
  expected_content_version!: number;

  @IsOptional() @IsBoolean()
  is_local_specialty?: boolean;

  // `| null` (không chỉ `| undefined`) để caller diễn đạt tường minh "xoá dietary" — xem ghi chú
  // đầy đủ ở UpdateHotelDetailsDto.
  @IsOptional() @IsObject()
  dietary?: Record<string, unknown> | null;

  // Danh sách MÃ cuisine (bảng cuisines.code) — thay TOÀN BỘ gán hiện có, cùng khuôn
  // UpdateHotelRoomsDto/UpdateRestaurantMenuDto (replace-all, không patch từng phần tử). Mã không
  // tồn tại bị từ chối ở service (không âm thầm bỏ qua — "thiếu khác với xác nhận không có").
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @IsString({ each: true }) @MaxLength(60, { each: true })
  cuisine_codes?: string[];
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

// CAS thật (2026-10-01, P0 permission audit) — BUG THẬT đã sửa: PATCH :id/menu là replace-all
// (RestaurantsRepository.replaceMenu xoá rồi chèn lại TOÀN BỘ sections/items) nhưng trước đây KHÔNG
// có token xung đột nào — hai tab/người sửa đồng thời, người lưu SAU âm thầm xoá sạch món của người
// lưu TRƯỚC, không 409, không cảnh báo. Mọi route ghi khác cùng place (`PATCH :id/details`,
// `:id/rooms`, `:id/faqs`, PlacesService.update) đều bắt buộc `expected_content_version` qua ĐÚNG
// MỘT cột `places.content_version` — menu là route replace-all DUY NHẤT còn thiếu, không phải một
// ngoại lệ có chủ đích.
export class UpdateRestaurantMenuDto {
  @IsInt() @Min(0)
  expected_content_version!: number;

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
