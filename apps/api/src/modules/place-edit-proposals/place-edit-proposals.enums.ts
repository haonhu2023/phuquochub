// Closed MVP allowlist (chk in InitPlaceEditProposals + Postgres ENUM) — deliberately NOT the
// free-varchar "evolving vocabulary" idiom used by source_attributions.field/
// place_field_evidence_links.field_name. This is an anti-abuse allowlist for what a community
// member may propose, not an open-ended extensibility point.
export enum PlaceEditProposalFieldKey {
  OPENING_HOURS = 'opening_hours',
  ADDRESS = 'address',
  SHORT_DESCRIPTION = 'short_description',
}

export enum PlaceEditProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  NEEDS_CHANGES = 'needs_changes',
  CONFLICT = 'conflict',
}

export enum PlaceEditProposalDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  NEEDS_CHANGES = 'needs_changes',
}
