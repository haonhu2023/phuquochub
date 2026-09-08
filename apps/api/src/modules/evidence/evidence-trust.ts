// Evidence-artifact verification statuses that "clear the gate" for any consumer deciding whether
// a piece of field evidence is trustworthy enough to act on — NEEDS_REVIEW is deliberately
// excluded; only a real human review (verifiedBy/verifiedAt, never set by an import path) may move
// a row into one of these. Originally private to EvidenceService.evaluateTranslationEvidenceGate();
// extracted here (2026-09-08, Right Now trust semantics gate) so PlacesRepository.rightNow() can
// require the SAME gate for place-field current-value evidence WITHOUT importing evidence.service.ts
// directly — that file already imports PlacesRepository (linkEvidenceToPlaceField needs it), so a
// places.repository.ts -> evidence.service.ts import would be a real circular module dependency.
// This file has zero imports of its own, so both sides can depend on it safely.
export const GATE_PASSING_VERIFICATION_STATUSES = new Set(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED']);
