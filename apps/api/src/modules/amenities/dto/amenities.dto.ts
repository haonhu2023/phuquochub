import { ArrayMaxSize, IsArray, IsInt, IsString, Min, MaxLength } from 'class-validator';

// Thay TOÀN BỘ gán tiện ích của một place theo mã (amenities.code) — cùng khuôn
// UpdateRestaurantDetailsDto.cuisine_codes (replace-all, mã lạ bị từ chối 400 rõ ràng ở service,
// không âm thầm bỏ qua).
//
// `expected_content_version` (2026-09-30) — CAS thật, cùng token `places.content_version` mà
// UpdateHotelDetailsDto/UpdateRestaurantDetailsDto dùng (xem ghi chú đầy đủ ở UpdateHotelDetailsDto).
// replace-all này trước đây không khoá/không CAS gì — đúng khoảng trống mà góp ý chỉ ra.
export class UpdatePlaceAmenitiesDto {
  @IsInt() @Min(0)
  expected_content_version!: number;

  @IsArray() @ArrayMaxSize(60)
  @IsString({ each: true }) @MaxLength(60, { each: true })
  amenity_codes!: string[];
}
