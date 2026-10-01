import { Type } from 'class-transformer';
import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';

export const HOTEL_TYPE_VALUES = ['resort', 'hotel', 'homestay', 'villa', 'guesthouse', 'apartment'] as const;
export type HotelType = (typeof HOTEL_TYPE_VALUES)[number];

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const HOTEL_SORT_VALUES = ['rating_desc', 'name_asc'] as const;
export type HotelSort = (typeof HOTEL_SORT_VALUES)[number];

// Query của `GET /api/hotels` — công khai. Chỉ `stars`/`sort` thực sự lọc/sắp xếp ở repository;
// `amenities`/`price_min`/`price_max` đã được KHAI trong openapi.yaml (Wave sau, dự kiến) nhưng
// CHƯA triển khai — cố tình KHÔNG khai ở đây, vì `forbidNonWhitelisted` (main.ts) sẽ từ chối
// 400 nếu client gửi, thay vì âm thầm chấp nhận rồi không lọc gì (tệ hơn: trông như lọc được).
export class ListHotelsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  stars?: number;

  @IsOptional() @IsIn(HOTEL_SORT_VALUES)
  sort?: HotelSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

export class RoomTypeDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @IsOptional() @IsNumber() @Min(0)
  price_ref?: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional() @IsString()
  valid_from?: string;

  @IsOptional() @IsString()
  valid_to?: string;

  @IsOptional() @IsInt()
  sort_order?: number;
}

export class UpdateHotelRoomsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomTypeDto)
  rooms!: RoomTypeDto[];
}

// place_hotel_details là NOT NULL trên hotel_type (InitHotel1720001000000) và hiện KHÔNG có hàng
// nào được tạo khi một place category='hotel' mới ra đời (không hook nào ghi bảng vệ tinh ở
// PlacesService.create() — xác nhận qua grep, chỉ SeedPlaceSatelliteDetails từng ghi một lần).
// Endpoint PATCH này vì vậy phải UPSERT, và hotel_type bắt buộc trong DTO đúng ràng buộc DB, không
// để service tự đoán giá trị mặc định.
// Field TÙY CHỌN "được phép xoá" khai kiểu `T | null` (không chỉ `T | undefined`) — để caller
// TypeScript thật (admin UI) có thể diễn đạt tường minh "xoá trường này" mà không cần ép kiểu.
// `@IsOptional()` của class-validator BỎ QUA mọi validator khác khi giá trị là `null` HOẶC
// `undefined` (đã xác minh runtime), nên khai `| null` không cần thêm decorator nào.
// CAS thật (2026-09-30) — client PHẢI gửi lại content_version của place (Place.content_version,
// AddPlaceContentVersion) mà nó đọc trước khi sửa. `SELECT ... FOR UPDATE` trên satellite table
// (bản cũ) chỉ khoá đúng lúc hai request chạy ĐỒNG THỜI — không chặn được request MUỘN từ một tab
// cũ (đọc dữ liệu từ lâu, giờ mới bấm lưu) ghi đè dữ liệu MỚI hơn mà nó chưa từng thấy — đây mới là
// khoảng trống CAS thật. Tái sử dụng ĐÚNG token `content_version` đã có ở `places`
// (PlacesRepository.updateScalarsWithCas dùng cùng token này) thay vì tạo một hệ version thứ hai
// chỉ cho satellite table.
export class UpdateHotelDetailsDto {
  @IsInt() @Min(0)
  expected_content_version!: number;

  @IsIn(HOTEL_TYPE_VALUES)
  hotel_type!: HotelType;

  @IsOptional() @IsInt() @Min(1) @Max(5)
  star_rating?: number | null;

  // "Hạng sao có nguồn" (product spec, 2026-09-29) — tái dùng `sources` đã có (AddHotelStarRatingSource),
  // không dựng hệ nguồn thứ hai. Gửi kèm star_rating khi có nguồn; service tự ghi verified_at=now().
  @IsOptional() @IsUUID()
  star_rating_source_id?: string | null;

  @IsOptional() @Matches(HH_MM, { message: 'check_in phải là giờ HH:MM (24h)' })
  check_in?: string | null;

  @IsOptional() @Matches(HH_MM, { message: 'check_out phải là giờ HH:MM (24h)' })
  check_out?: string | null;
}
