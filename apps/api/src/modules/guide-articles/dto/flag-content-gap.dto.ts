import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /admin/guide-articles/:id/flag-gap body — the literal "Khi thiếu fact... tạo Owner
// Decision Queue" hook. `note` is required: an unexplained flag is not actionable for whoever
// resolves it (same required-notes-for-a-real-decision rule TranslationReviewService enforces for
// REJECTED/NEEDS_CHANGES).
export class FlagContentGapDto {
  @IsUUID()
  blockId!: string;

  @IsString() @MinLength(1) @MaxLength(300)
  note!: string;
}
