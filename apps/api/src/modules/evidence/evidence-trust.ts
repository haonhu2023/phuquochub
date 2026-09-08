import { SourceType } from '../sources/sources.enums';

// Evidence-artifact verification statuses that "clear the gate" for any consumer deciding whether
// a piece of field evidence is trustworthy enough to act on — NEEDS_REVIEW is deliberately
// excluded; only a real human review (verifiedBy/verifiedAt, never set by an import path) may move
// a row into one of these. Originally private to EvidenceService.evaluateTranslationEvidenceGate();
// extracted here (2026-09-08, Right Now trust semantics gate) so PlacesRepository.rightNow() can
// require the SAME gate for place-field current-value evidence WITHOUT importing evidence.service.ts
// directly — that file already imports PlacesRepository (linkEvidenceToPlaceField needs it), so a
// places.repository.ts -> evidence.service.ts import would be a real circular module dependency.
// This file has zero imports of its own besides sources.enums.ts (a leaf enum file with no imports
// of its own either), so both sides can depend on it safely.
export const GATE_PASSING_VERIFICATION_STATUSES = new Set(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED']);

// CRITICAL GAP CLOSED HERE (2026-09-08, PR #24 final trust-semantics review): an
// `evidence_artifacts.verification_status` of 'VERIFIED'/'BUSINESS_VERIFIED_AND_REVIEWED' does
// NOT, by itself, guarantee the underlying SOURCE is credible — that column is a plain unindexed
// `string`, not a Postgres enum, with no DB check and (as of this review) no real write path in
// this codebase that ever sets it to a gate-passing value at all; its meaning is a pure convention
// trusted to whoever calls `EvidenceService.ensureEvidenceArtifact`. So "VERIFIED" alone would let
// a claim backed by a low-authority or unrelated source (a Facebook post, a community submission,
// an AI-generated guess) pass a gate meant to certify "safe to act on right now."
//
// `verifications.status = 'official'` already solves an analogous problem for a DIFFERENT gate via
// `OFFICIAL_SOURCE_TYPES` (verifications.service.ts's `buildOfficialTransition` — a place cannot
// reach `official` on a `community`/`facebook`/`ai`/etc. source). Moved here (not left duplicated)
// so `PlacesRepository.rightNow()`'s field-evidence gate can require the SAME source-authority
// floor without importing verifications.service.ts (which itself already imports PlacesRepository
// — same circular-import shape GATE_PASSING_VERIFICATION_STATUSES above was extracted to avoid).
// `verifications.service.ts` now re-exports this constant rather than keeping its own copy.
export const OFFICIAL_SOURCE_TYPES = new Set<SourceType>([
  SourceType.OFFICIAL_WEBSITE,
  SourceType.BUSINESS_OWNER,
  SourceType.GOVERNMENT,
]);
