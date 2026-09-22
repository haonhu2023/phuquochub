import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { GuideBlockType } from '../guide-article.enums';

// Wire shape for one block inside SaveGuideDraftDto.blocks[]. `content`'s exact required keys
// depend on `blockType` — see GuideArticlesService.validateBlockContent()'s doc for the closed set
// of per-type shapes (section_heading/rich_text/place_collection/callout/faq/image_with_rights).
// Validated here only as "some plain object" (class-validator has no clean discriminated-union
// support without a much heavier `@ValidateNested` tree per type); the SERVICE is the one place
// that enforces the real per-type shape, same division of responsibility ContactImportService used
// for its plan-row contract this session — DTOs bound wire shape, services enforce business shape.
export class GuideBlockDto {
  @IsEnum(GuideBlockType)
  blockType!: GuideBlockType;

  @IsObject()
  content!: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  needsDecision?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  decisionNote?: string;
}
