import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class MenuItemDto {
  @IsString() @MaxLength(160)
  name!: string;

  @IsOptional() @IsNumber() @Min(0)
  price?: number;

  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @IsOptional()
  tags?: unknown;

  @IsOptional()
  sort_order?: number;
}

export class MenuSectionDto {
  @IsString() @MaxLength(120)
  name!: string;

  @IsOptional()
  sort_order?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items!: MenuItemDto[];
}

export class UpdateRestaurantMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuSectionDto)
  sections!: MenuSectionDto[];
}
