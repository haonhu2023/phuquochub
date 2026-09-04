import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HumanReviewStatus } from '../../multilingual-import/multilingual-import.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /admin/place-translations/:id/review body (human-translation-review, 2026-09-04).
// Deliberately the ONLY two fields accepted — main.ts's global ValidationPipe runs with
// `whitelist: true, forbidNonWhitelisted: true`, so any extra field (reviewer_id, reviewed_at,
// is_public, production_eligible, ...) is rejected with 400 before this DTO is even constructed.
// The real reviewer identity comes from the authenticated principal (CurrentUser), never the body
// — see TranslationReviewService.reviewTranslation()'s own comment on why.
export class ReviewPlaceTranslationDto {
  // PENDING is deliberately excluded — "decide PENDING" is not a real decision an actor can make;
  // PENDING is only ever the starting/never-reviewed state.
  @IsIn([HumanReviewStatus.APPROVED, HumanReviewStatus.REJECTED, HumanReviewStatus.NEEDS_CHANGES])
  decision!: HumanReviewStatus.APPROVED | HumanReviewStatus.REJECTED | HumanReviewStatus.NEEDS_CHANGES;

  @IsOptional() @IsString() @MaxLength(1000)
  @Transform(trim)
  notes?: string;
}
