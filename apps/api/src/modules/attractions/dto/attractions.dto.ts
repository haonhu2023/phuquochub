import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PriceRange } from '../../places/place.enums';

export const ATTRACTION_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type AttractionSort = (typeof ATTRACTION_SORT_VALUES)[number];

// Query của `GET /api/attractions` — công khai.
//
// Điểm tham quan KHÔNG có bảng vệ tinh riêng (khác Hotel/Restaurant/Tour theo ADR-002):
// "attraction" chỉ là một `categories.slug`, nên mọi trường có thể lọc đều nằm trên `places`.
// Chỉ khai ở đây những gì thực sự có cột và có dữ liệu seed:
//   · `ward`        → places.ward (đã seed: Dương Đông, Dương Tơ, Gành Dầu, An Thới, …)
//   · `price_range` → places.price_range (enum, đã seed; NULL với 4 điểm seed đầu tiên)
//
// KHÔNG khai (⇒ `forbidNonWhitelisted` từ chối 400 thay vì âm thầm bỏ qua):
//   · `category` — /attractions ĐÃ LÀ một category; bảng `categories` phẳng, không có
//     phân cấp con nào để lọc tiếp. Cần duyệt category khác → dùng `GET /places?category=`.
//   · `district` — không có cột nào ngoài `ward`; đảo Phú Quốc chỉ phân theo phường/xã.
//   · `free_entry` — sẽ chỉ là bí danh của `price_range=free`; hai đường diễn đạt cùng một
//     điều kiện mở đường cho tổ hợp tự mâu thuẫn (`free_entry=true&price_range=high`).
//   · `family_friendly`/`indoor`/`outdoor` — KHÔNG có cột nào tương ứng trong schema; muốn có
//     phải thêm migration + nguồn dữ liệu, không phải suy đoán từ mô tả.
//   · `open_now` — common/opening-hours.ts chỉ validate CẤU TRÚC opening_hours, không đánh giá
//     một thời điểm (timezone/khung qua đêm/ngoại lệ ngày lễ). Cùng quyết định đã ghi ở
//     Restaurants: một phép so sánh SQL đơn giản sẽ cho kết quả SAI.
export class ListAttractionsQueryDto {
  // `ward` là dữ liệu tham chiếu MỞ (varchar tự do trên places) — không hardcode whitelist,
  // giá trị lạ chỉ khớp 0 dòng ở repository. Cùng quy ước với `GET /places?ward=`.
  @IsOptional() @IsString() @MaxLength(120)
  ward?: string;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;

  @IsOptional() @IsIn(ATTRACTION_SORT_VALUES)
  sort?: AttractionSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
