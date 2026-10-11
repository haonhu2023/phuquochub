// Opening-Hours Evidence Workflow — kiểu dữ liệu web, khớp DTO/response thật của
// apps/api/src/modules/evidence/{dto/opening-hours-evidence.dto.ts, opening-hours-evidence.service.ts}.
// CHỈ phục vụ opening_hours (xem comment trong 2 file API trên) — không phải một kiểu field chung.

export const OFFICIAL_SOURCE_TYPE_VALUES = ['official_website', 'business_owner', 'government'] as const;
export type OfficialSourceType = (typeof OFFICIAL_SOURCE_TYPE_VALUES)[number];

export type ScheduleStability = 'STABLE' | 'TEMPORARY';
export type EvidenceReviewDecision = 'APPROVE' | 'NEEDS_CHANGES' | 'REJECT';

export interface SubmitOpeningHoursEvidenceInput {
  source_type: OfficialSourceType;
  source_url: string;
  source_title?: string;
  source_publisher?: string;
  observed_text: string;
  captured_at?: string;
  schedule_stability: ScheduleStability;
}

export interface SubmitOpeningHoursEvidenceResult {
  evidence_artifact_id: string;
  place_id: string;
  verification_status: string;
}

export interface OpeningHoursEvidencePendingView {
  evidence_artifact_id: string;
  place_id: string | null;
  place_name: string | null;
  place_slug: string | null;
  place_current_opening_hours: unknown;
  source_url: string;
  captured_at: string;
  observed_text: string | null;
  schedule_stability_claimed: ScheduleStability | null;
  submitted_at: string;
}

export interface ReviewOpeningHoursEvidenceInput {
  decision: EvidenceReviewDecision;
  schedule_stability: ScheduleStability;
  review_note?: string;
}

export interface ReviewOpeningHoursEvidenceResult {
  decision: EvidenceReviewDecision;
  eligible: boolean;
  reason_codes: string[];
  evidence_verified: boolean;
  linked_to_public_gate: boolean;
}
