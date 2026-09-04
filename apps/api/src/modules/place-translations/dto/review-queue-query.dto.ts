import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { HumanReviewStatus } from '../../multilingual-import/multilingual-import.enums';

// Query params arrive as a single comma-joined string (?humanReviewStatus=PENDING,NEEDS_CHANGES) or
// as a repeated key (Express gives an array already) — normalize both to a string[] before @IsArray
// validates it.
function toArray({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return value;
}

// GET /admin/place-translations/review-queue query params (human-translation-review, 2026-09-04).
// All optional — an empty query returns every PENDING/NEEDS_CHANGES item, capped at `limit`.
export class ReviewQueueQueryDto {
  @IsOptional() @IsUUID('4')
  placeId?: string;

  @IsOptional()
  placeSlug?: string;

  @IsOptional()
  localeCode?: string;

  @IsOptional()
  fieldKey?: string;

  // Comma-separated in the query string (e.g. ?humanReviewStatus=PENDING,NEEDS_CHANGES); repeated
  // to explicitly re-include an already-decided status (e.g. reviewing history) is intentionally
  // NOT supported by this endpoint — it is a queue of pending work, not a general translation browser.
  @IsOptional() @Transform(toArray) @IsArray()
  @IsIn([HumanReviewStatus.PENDING, HumanReviewStatus.NEEDS_CHANGES], { each: true })
  humanReviewStatus?: HumanReviewStatus[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}
