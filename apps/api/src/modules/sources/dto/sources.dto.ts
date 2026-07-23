import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SourceKind, SourceType, SOURCE_ATTRIBUTION_ENTITY_TYPES } from '../sources.enums';

export class CreateSourceDto {
  @IsEnum(SourceType)
  type!: SourceType;

  @IsEnum(SourceKind)
  kind!: SourceKind;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;

  @IsOptional() @IsString() @MaxLength(150)
  external_ref?: string;

  @IsOptional() @IsString() @MaxLength(200)
  publisher?: string;

  @IsOptional() @IsString() @MaxLength(60)
  license?: string;

  // Bỏ trống → service khởi tạo theo SOURCE_TYPE_DEFAULT_RELIABILITY[type] (source.md §4.1).
  @IsOptional() @IsInt() @Min(0) @Max(100)
  reliability?: number;

  @IsOptional() @IsString() @MaxLength(2)
  language?: string;

  @IsOptional() @IsISO8601()
  retrieved_at?: string;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListAttributionsQueryDto {
  @IsString() @IsIn(SOURCE_ATTRIBUTION_ENTITY_TYPES)
  entity_type!: string;

  @IsUUID()
  entity_id!: string;

  @IsOptional() @IsString() @MaxLength(60)
  field?: string;
}

export class CreateAttributionDto {
  @IsUUID()
  source_id!: string;

  @IsString() @IsIn(SOURCE_ATTRIBUTION_ENTITY_TYPES)
  entity_type!: string;

  @IsUUID()
  entity_id!: string;

  @IsOptional() @IsString() @MaxLength(60)
  field?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  confidence?: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;
}
