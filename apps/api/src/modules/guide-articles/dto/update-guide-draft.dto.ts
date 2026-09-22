import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GuideBlockDto } from './guide-block.dto';

// PATCH /admin/guide-articles/:id body.
//
// Deliberately NOT `extends SaveGuideDraftDto`: slug/locale are set once at creation and are
// immutable afterwards (same rule as Place — UpdatePlaceDto has no slug field either), and
// GuideArticlesService.saveDraft() has never read them from the patch body. The old DTO inherited
// `slug`/`locale` as REQUIRED fields anyway, so every draft save forced the client to resend them
// while the service silently dropped both — the request looked like it could rename/re-locale the
// article and could not. This DTO only carries fields saveDraft() actually writes, plus the CAS
// token.
export class UpdateGuideDraftDto {
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

  @IsInt() @Min(1)
  expectedContentVersion!: number;
}
