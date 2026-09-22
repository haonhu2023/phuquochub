import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GuideBlockDto } from './guide-block.dto';

// POST /admin/guide-articles body — creates a new draft. `slug`/`locale` together must be unique
// (guide_articles UNIQUE(slug, locale), enforced at the DB and re-checked in the service for a
// clean 409 instead of a raw constraint-violation 500).
export class SaveGuideDraftDto {
  @IsString() @MinLength(1) @MaxLength(160)
  slug!: string;

  @IsIn(['vi', 'en'])
  locale!: 'vi' | 'en';

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(500)
  intro?: string;

  @IsOptional() @IsUUID()
  heroMediaId?: string;

  @IsArray() @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => GuideBlockDto)
  blocks!: GuideBlockDto[];
}
