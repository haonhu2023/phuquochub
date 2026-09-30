import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
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

// place_tour_details đã có hàng từ lúc tạo (ToursService.create → createDetails), khác
// hotel/restaurant/beach — UPDATE thẳng, PATCH TỪNG PHẦN thật (xem ToursRepository.updateDetails).
// organizer_id trỏ tới MỘT place khác (đơn vị tổ chức) — đúng khuôn cột đã có (InitTour), không
// đổi kiểu dữ liệu chỉ vì "đơn vị tổ chức" thường là tên công ty tự do; nếu công ty đó chưa có
// place riêng, để trống — không ép người biên tập tạo một place giả chỉ để có ID.
// Field "được phép xoá" khai `T | null` — xem ghi chú đầy đủ ở UpdateHotelDetailsDto.
export class UpdateTourDetailsDto {
  @IsOptional() @IsEnum(TourTypeDto)
  tour_type?: TourTypeDto;

  @IsOptional() @IsInt() @Min(1)
  duration_minutes?: number | null;

  @IsOptional() @IsEnum(TourDifficultyDto)
  difficulty?: TourDifficultyDto | null;

  @IsOptional() @IsUUID()
  organizer_id?: string | null;

  @IsOptional() @IsString() @MaxLength(300)
  pickup_point?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  inclusions?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  exclusions?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  cancellation_policy?: string | null;
}

// tour_stops — "lịch trình theo mốc". Thay TOÀN BỘ, cùng khuôn UpdateHotelRoomsDto/
// UpdateRestaurantMenuDto — đường ghi ĐẦU TIÊN cho bảng này (trước chỉ đọc).
export class TourStopDto {
  @IsString() @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() @MaxLength(40)
  time?: string;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @IsOptional() @ValidateNested() @Type(() => GeoPointDto)
  location?: GeoPointDto;

  @IsOptional() @IsInt()
  sort_order?: number;
}

export class UpdateTourStopsDto {
  @IsArray() @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TourStopDto)
  stops!: TourStopDto[];
}
