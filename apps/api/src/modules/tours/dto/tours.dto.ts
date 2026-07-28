import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PriceRange } from '../../places/place.enums';

export enum TourTypeDto {
  DIVING = 'diving',
  FISHING = 'fishing',
  TREKKING = 'trekking',
  SIGHTSEEING = 'sightseeing',
  CRUISE = 'cruise',
  OTHER = 'other',
}
export enum TourDifficultyDto {
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
}

class GeoPointDto {
  @IsNumber() @Min(-90) @Max(90) @Type(() => Number)
  lat!: number;
  @IsNumber() @Min(-180) @Max(180) @Type(() => Number)
  lng!: number;
}

export class CreateTourDto {
  @IsString() @MaxLength(200)
  name!: string;

  @ValidateNested() @Type(() => GeoPointDto)
  location!: GeoPointDto;

  @IsEnum(TourTypeDto)
  tour_type!: TourTypeDto;

  @IsOptional() @IsInt() @Min(1)
  duration_minutes?: number;

  @IsOptional() @IsEnum(TourDifficultyDto)
  difficulty?: TourDifficultyDto;

  @IsOptional() @IsString() @MaxLength(300)
  short_description?: string;

  @IsOptional() @IsString()
  description?: string;
}

export const TOUR_SORT_VALUES = ['rating_desc', 'name_asc', 'duration_asc'] as const;
export type TourSort = (typeof TOUR_SORT_VALUES)[number];

// Query của `GET /api/tours` — công khai. `type`/`difficulty`/`price_range`/`max_duration_minutes`/
// `departure_area`/`sort`/`page`/`limit` đều lọc/sắp xếp thật ở repository.
//
// KHÔNG khai ở đây (⇒ `forbidNonWhitelisted` từ chối 400 thay vì âm thầm bỏ qua):
//  · `duration` (openapi cũ, `type: integer`) — ngữ nghĩa mơ hồ (đúng bằng? tối đa? theo giờ hay
//    phút?). Thay bằng `max_duration_minutes` nêu rõ đơn vị và phép so sánh.
//  · `price_max` — giá tour nằm ở `tour_schedules.price` theo từng chuyến khởi hành; bảng đó chưa
//    có seed lẫn endpoint ghi nào, và "chuyến rẻ nhất trong khoảng thời gian nào" là một chính
//    sách riêng chưa được quyết. Lọc theo mức giá dùng `price_range` (places.price_range) —
//    trường ĐÃ có dữ liệu thật, cùng quy ước với Restaurants.
export class ListToursQueryDto {
  @IsOptional() @IsEnum(TourTypeDto)
  type?: TourTypeDto;

  @IsOptional() @IsEnum(TourDifficultyDto)
  difficulty?: TourDifficultyDto;

  @IsOptional() @IsEnum(PriceRange)
  price_range?: PriceRange;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  max_duration_minutes?: number;

  // Khu vực khởi hành = `places.ward` (varchar(120), dữ liệu tham chiếu MỞ). Cùng lập luận với
  // `cuisine` của Restaurants: không hardcode whitelist — ward lạ chỉ khớp 0 dòng ở repository,
  // không nên bị từ chối 400 chỉ vì DTO chưa theo kịp dữ liệu.
  @IsOptional() @IsString() @MaxLength(120)
  departure_area?: string;

  @IsOptional() @IsIn(TOUR_SORT_VALUES)
  sort?: TourSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
