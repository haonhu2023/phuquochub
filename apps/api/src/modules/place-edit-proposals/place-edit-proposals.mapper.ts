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
