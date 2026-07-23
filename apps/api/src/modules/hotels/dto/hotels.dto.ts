import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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
