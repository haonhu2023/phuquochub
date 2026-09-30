import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PriceRange } from '../../places/place.enums';

export const BEACH_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type BeachSort = (typeof BEACH_SORT_VALUES)[number];

// Query của `GET /api/beaches` — công khai.
//
// Bãi biển KHÔNG có bảng vệ tinh riêng (giống Attraction, khác Hotel/Restaurant/Tour theo
// ADR-002): "beach" chỉ là một `categories.slug`, nên mọi trường lọc được đều nằm trên `places`.
// Chỉ khai ở đây những gì thực sự có cột VÀ có dữ liệu seed (10 bãi biển published):
//   · `ward`        → places.ward (7 phường/xã có dữ liệu thật)
//   · `price_range` → places.price_range (7 bãi 'free', 3 bãi NULL)
//
// KHÔNG khai (⇒ `forbidNonWhitelisted` từ chối 400 thay vì âm thầm bỏ qua):
//   · `category` — /beaches ĐÃ LÀ một category; bảng `categories` phẳng, không có phân cấp con.
//   · `district` — schema chỉ có `ward`.
//   · `free_entry` — trùng nghĩa `price_range=free`.
//   · `swimming`/`lifeguard`/`facilities`/`water_quality`/`sunset` — KHÔNG có cột nào tương ứng.
//     Đây là loại thông tin phải có nguồn kiểm chứng (an toàn bơi lội, cứu hộ) — suy đoán từ mô
//     tả marketing rồi phát ra như dữ liệu là điều tuyệt đối không làm.
//   · `open_now` — bãi biển không có opening_hours trong seed, và common/opening-hours.ts vẫn chỉ
//     validate CẤU TRÚC chứ chưa đánh giá thời điểm (cùng quyết định đã ghi ở Restaurants).
export class ListBeachesQueryDto {
  // `ward` là dữ liệu tham chiếu MỞ (varchar tự do trên places) — không hardcode whitelist,
  // giá trị lạ chỉ khớp 0 dòng ở repository. Cùng quy ước với `GET /places?ward=`.
  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;

  @IsOptional() @IsIn(BEACH_SORT_VALUES)
  sort?: BeachSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

// place_beach_details (InitBeachDetails1720007700000, product spec 2026-09-29). UPSERT — cùng lý
// do UpdateHotelDetailsDto: hàng này không tự sinh khi place category='beach' ra đời.
//
// access_route/characteristics/services: mô tả tĩnh, KHÔNG bắt buộc nguồn.
// best_season/lifeguard_info/sourced_notes: trường "nhạy thời gian"/an toàn — brief cấm suy đoán
// ("Không tạo điểm 'an toàn' từ suy đoán"). Mỗi trường có *_source_id TÙY CHỌN; service tự ghi
// *_verified_at=now() khi có mặt, cùng khuôn UpdateHotelDetailsDto.star_rating_source_id.
// Field TÙY CHỌN "được phép xoá" khai kiểu `T | null` (không chỉ `T | undefined`) — xem ghi chú
// đầy đủ ở UpdateHotelDetailsDto.
export class UpdateBeachDetailsDto {
  @IsOptional() @IsString() @MaxLength(2000)
  access_route?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  characteristics?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  services?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  best_season?: string | null;

  @IsOptional() @IsUUID()
  best_season_source_id?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  lifeguard_info?: string | null;

  @IsOptional() @IsUUID()
  lifeguard_info_source_id?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  sourced_notes?: string | null;

  @IsOptional() @IsUUID()
  sourced_notes_source_id?: string | null;
}
