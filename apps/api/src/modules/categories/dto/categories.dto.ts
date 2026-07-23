import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(120)
  name_vi!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  icon?: string;

  // Nếu bỏ trống, service tự sinh từ name_vi (slugify tiếng Việt).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_vi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  icon?: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
