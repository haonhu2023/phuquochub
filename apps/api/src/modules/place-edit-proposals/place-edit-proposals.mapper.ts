import { PlaceEditProposal } from './entities/place-edit-proposal.entity';

// Staff-facing shape ONLY — this feature has no public-facing read of proposals at all (task
// requirement: "không lộ ... nội dung chưa duyệt công khai"). `proposer_id`/`reviewer_id` are raw
// UUIDs, never joined to `users` for email/display name here — "không lộ email, định danh nội bộ"
// is satisfied by never fetching that data in the first place, not by redacting it after the fact.
export function toPlaceEditProposalView(row: PlaceEditProposal) {
  return {
    id: row.id,
    place_id: row.placeId,
    field_key: row.fieldKey,
    locale_code: row.localeCode,
    proposed_value: row.proposedValue,
    reason: row.reason,
    source_url: row.sourceUrl,
    status: row.status,
    proposer_id: row.proposerId,
    reviewer_id: row.reviewerId,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    review_note: row.reviewNote,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// Submitter-facing shape ("Đóng góp của tôi") — the caller already scoped the query to the
// caller's OWN `proposerId` (see `PlaceEditProposalsService.listMine()`), so returning this row's
// own status/review_note back to its own author is not a leak. `reviewer_id` is DROPPED here on
// purpose: it is a staff account's internal UUID, meaningless to the submitter and not needed to
// understand the outcome (`status` + `review_note` already say what happened and why) — the
// staff-facing `toPlaceEditProposalView()` above keeps it, this one does not, so the two shapes
// cannot be accidentally swapped without a type error at the call site. `place_name`/`place_slug`
// are added so the UI can show which place a proposal is about without the client needing a raw
// UUID lookup — resolved by `listMine()` from the SAME `PlacesRepository.getCardByIdIncludingInactive()`
// every other read path already uses, not a new query.
export function toMyPlaceEditProposalView(
  row: PlaceEditProposal,
  place: { name: string; slug: string } | null,
) {
  return {
    id: row.id,
    place_id: row.placeId,
    place_name: place?.name ?? null,
    place_slug: place?.slug ?? null,
    field_key: row.fieldKey,
    locale_code: row.localeCode,
    proposed_value: row.proposedValue,
    reason: row.reason,
    source_url: row.sourceUrl,
    status: row.status,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    review_note: row.reviewNote,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
