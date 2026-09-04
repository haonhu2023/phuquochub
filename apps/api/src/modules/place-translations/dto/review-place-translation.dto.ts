import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HumanReviewStatus } from '../../multilingual-import/multilingual-import.enums';
import { REVIEW_NOTES_MAX_LENGTH } from '../translation-review.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /admin/place-translations/:id/review body (human-translation-review, 2026-09-04).
// Deliberately the ONLY two fields accepted — main.ts's global ValidationPipe runs with
// `whitelist: true, forbidNonWhitelisted: true`, so any extra field (reviewer_id, reviewed_at,
// is_public, production_eligible, ...) is rejected with 400 before this DTO is even constructed.
// The real reviewer identity comes from the authenticated principal (CurrentUser), never the body
// — see TranslationReviewService.reviewTranslation()'s own comment on why.
//
// `notes` is REQUIRED for REJECTED/NEEDS_CHANGES and optional for APPROVED — that cross-field rule
// is decision-dependent, so it is enforced in TranslationReviewService (the one place that cannot be
// bypassed), not here; this DTO only bounds length so the client gets a clear 400 instead of the
// server silently truncating into wiki_revisions.change_note's varchar(300) (see
// REVIEW_NOTES_MAX_LENGTH's own comment for why 200, specifically).
export class ReviewPlaceTranslationDto {
  // PENDING is deliberately excluded — "decide PENDING" is not a real decision an actor can make;
  // PENDING is only ever the starting/never-reviewed state.
  @IsIn([HumanReviewStatus.APPROVED, HumanReviewStatus.REJECTED, HumanReviewStatus.NEEDS_CHANGES])
  decision!: HumanReviewStatus.APPROVED | HumanReviewStatus.REJECTED | HumanReviewStatus.NEEDS_CHANGES;

  @IsOptional() @IsString() @MaxLength(REVIEW_NOTES_MAX_LENGTH)
  @Transform(trim)
  notes?: string;
}
