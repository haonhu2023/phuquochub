import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MinLength, Min } from 'class-validator';
import { PriceRange } from '../../places/place.enums';

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional() @IsString()
  type?: string;

  // Cùng convention với ListPlacesQueryDto (places.dto.ts) — category là category_id (uuid),
  // chỉ @IsString() (không @IsUUID()) để khớp chính xác kiểu lỏng đã có, tránh lệch hành vi
  // giữa hai endpoint lọc cùng một cột places.category_id.
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

export class SuggestQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;
}
