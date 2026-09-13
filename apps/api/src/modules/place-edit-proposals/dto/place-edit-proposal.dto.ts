import { IsDefined, IsEnum, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PlaceEditProposalDecision, PlaceEditProposalFieldKey, PlaceEditProposalStatus } from '../place-edit-proposals.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// `proposed_value` is intentionally NOT shape-validated here by class-validator — its valid shape
// depends on `field_key` (a string for address/short_description, a structured object for
// opening_hours), which class-validator's per-property decorators cannot express well as a single
// conditional. PlaceEditProposalsService validates the actual shape per field_key (reusing
// `openingHoursErrors()` from common/opening-hours.ts for the opening_hours case — the SAME
// structural check UpdatePlaceDto's @IsOpeningHours() already applies, not a second definition of
// it) BEFORE ever writing the row. `@IsDefined()` here only rejects an entirely missing field.
export class CreatePlaceEditProposalDto {
  @IsEnum(PlaceEditProposalFieldKey)
  field_key!: PlaceEditProposalFieldKey;

  @IsDefined()
  proposed_value!: unknown;

  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  reason!: string;

  // Format-only check (no network I/O) — the task explicitly forbids fetching a user-submitted URL.
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  source_url?: string;

  // Which locale the proposer was viewing (informational only — see entity comment). NOT validated
  // against `supported_locales` here; an unknown code is harmless (never used to route the write)
  // and the FK on the column itself would reject an invalid one at insert time regardless.
  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale_code?: string;
}

export class DecidePlaceEditProposalDto {
  @IsEnum(PlaceEditProposalDecision)
  decision!: PlaceEditProposalDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  note?: string;
}

export class ListPlaceEditProposalsQueryDto {
  @IsOptional()
  @IsIn(Object.values(PlaceEditProposalStatus))
  status?: PlaceEditProposalStatus;

  @IsOptional()
  @IsUUID()
  place_id?: string;
}
