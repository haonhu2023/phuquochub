import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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
