import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BOOKABLE_ENTITY_TYPES, BookableEntityType } from '../booking.enums';

export class CreateBookingItemDto {
  @IsString() @MaxLength(200)
  label!: string;

  @IsInt() @Min(1) @Max(50)
  quantity!: number;

  @IsNumber() @Min(0)
  unit_price!: number;
}

// Foundation: một booking = một satellite Place (entity_type/entity_id/place_id), kèm ≥1 line
// item. Không payment thật, không mã giảm giá (discount/fees luôn 0 ở slice này).
export class CreateBookingRequestDto {
  @IsIn(BOOKABLE_ENTITY_TYPES)
  entity_type!: BookableEntityType;

  @IsUUID('4')
  entity_id!: string;

  @IsUUID('4')
  place_id!: string;

  @IsOptional() @IsString() @MaxLength(30)
  booking_type?: string;

  @IsOptional() @IsISO8601()
  service_start_at?: string;

  @IsOptional() @IsISO8601()
  service_end_at?: string;

  @IsInt() @Min(1) @Max(200)
  party_size!: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBookingItemDto)
  items!: CreateBookingItemDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  guest_note?: string;
}
