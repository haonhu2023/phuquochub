import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePriceDto {
  @IsString() @MaxLength(120)
  service_name!: string;

  @Type(() => Number) @IsNumber() @Min(0)
  amount!: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(40)
  unit?: string;

  @IsOptional() @IsBoolean()
  is_free?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsISO8601()
  valid_from?: string;

  @IsOptional() @IsISO8601()
  valid_to?: string;

  @IsOptional() @IsInt()
  display_order?: number;
}

export class UpdatePriceDto {
  @IsOptional() @IsString() @MaxLength(120)
  service_name?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsString() @MaxLength(40)
  unit?: string;

  @IsOptional() @IsBoolean()
  is_free?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsOptional() @IsISO8601()
  valid_to?: string;

  @IsOptional() @IsInt()
  display_order?: number;
}
