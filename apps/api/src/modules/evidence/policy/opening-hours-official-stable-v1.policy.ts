import { SourceType } from '../../sources/sources.enums';
import { OFFICIAL_SOURCE_TYPES } from '../evidence-trust';
import type { EvidenceReviewDecision } from '../entities/evidence-review.entity';

// OPENING_HOURS_OFFICIAL_STABLE_V1 — the first versioned freshness/governance policy for
// opening_hours evidence (product decision, 2026-09-10). Scope: claim_type=opening_hours, a STABLE
// (non-temporary/event/holiday) schedule, a first-party source, evidence with a real captured_at,
// and a human approval bound to the exact evidence content hash it reviewed.
export const OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_KEY = 'OPENING_HOURS_OFFICIAL_STABLE_V1';
export const OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_VERSION = '1';

export const MAX_CAPTURE_AGE_HOURS = 168; // 7 days — rule 1
export const VALIDITY_DAYS = 30; // rule 2
const VALIDITY_MS = VALIDITY_DAYS * 24 * 60 * 60 * 1000;
const MAX_CAPTURE_AGE_MS = MAX_CAPTURE_AGE_HOURS * 60 * 60 * 1000;

export type ScheduleStability = 'STABLE' | 'TEMPORARY';

export type PolicyReasonCode =
  | 'ELIGIBLE'
  | 'CAPTURE_TOO_OLD'
  | 'EVIDENCE_HASH_MISMATCH'
  | 'SOURCE_NOT_FIRST_PARTY'
  | 'TEMPORARY_SCHEDULE_UNSUPPORTED'
  | 'CLAIM_TYPE_UNSUPPORTED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'DECISION_NOT_APPROVED'
  | 'ALREADY_EXPIRED';

export interface PolicyEvaluationInput {
  claimType: string;
  sourceType: SourceType | string;
  scheduleStability: ScheduleStability;
  /** When the underlying evidence was captured. */
  capturedAt: Date;
  /** When the human review happened — capture age is measured against THIS, never re-measured later. */
  reviewedAt: Date;
  /** Caller-supplied wall-clock reference for the ALREADY_EXPIRED check — never read internally via `new Date()` so callers (and tests) stay fully deterministic. */
  now: Date;
  /** evidence_artifacts.contentHashSha256 as it stands right now. */
  currentEvidenceContentHash: string;
  /** The evidence content hash the human approval receipt attests it reviewed. */
  approvalBoundEvidenceHash: string;
  /** `null` means no human decision has been recorded at all (distinct from an explicit NEEDS_CHANGES/REJECT). */
  decision: EvidenceReviewDecision | null;
}

export interface PolicyEvaluationResult {
  eligible: boolean;
  /** `['ELIGIBLE']` when eligible; every applicable failure reason otherwise (never just the first one found). */
  reasonCodes: PolicyReasonCode[];
  policyKey: string;
  policyVersion: string;
  /** Deterministic function of `capturedAt` alone (rule 2/3 — never re-derived from `reviewedAt`). Always populated, regardless of eligibility, so a caller can decide independently whether to persist it. */
  verificationExpiresAt: Date;
}

function isFirstPartySource(sourceType: SourceType | string): boolean {
  return OFFICIAL_SOURCE_TYPES.has(sourceType as SourceType);
}

// Pure, deterministic, unit-testable — no `new Date()`, no I/O, no throw. Every applicable failure
// reason is collected (not just the first), because a caller (audit log, UI) needs the FULL picture
// of why a review did not clear the gate, not merely the first check that happened to fail.
export function evaluateOpeningHoursOfficialStableV1(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const reasonCodes: PolicyReasonCode[] = [];

  if (input.claimType !== 'opening_hours') {
    reasonCodes.push('CLAIM_TYPE_UNSUPPORTED');
  }

  if (input.scheduleStability !== 'STABLE') {
    reasonCodes.push('TEMPORARY_SCHEDULE_UNSUPPORTED');
  }

  if (!isFirstPartySource(input.sourceType)) {
    reasonCodes.push('SOURCE_NOT_FIRST_PARTY');
  }

  // A future captured_at has no well-defined age — treated as a capture-age violation rather than
  // silently passing (there is no separate reason code for "future capture" in the required set;
  // it is, semantically, exactly this same rule: the capture is not within the last 168 hours).
  const captureAgeMs = input.reviewedAt.getTime() - input.capturedAt.getTime();
  if (captureAgeMs < 0 || captureAgeMs > MAX_CAPTURE_AGE_MS) {
    reasonCodes.push('CAPTURE_TOO_OLD');
  }

  if (input.approvalBoundEvidenceHash !== input.currentEvidenceContentHash) {
    reasonCodes.push('EVIDENCE_HASH_MISMATCH');
  }

  if (input.decision === null) {
    reasonCodes.push('HUMAN_APPROVAL_REQUIRED');
  } else if (input.decision !== 'APPROVE') {
    reasonCodes.push('DECISION_NOT_APPROVED');
  }

  // Rule 2/3: expires_at = captured_at + 30 days, ALWAYS — never recomputed from reviewedAt, and
  // computed regardless of whether the review otherwise passes (a caller may want to know the
  // theoretical expiry even for a rejected review).
  const verificationExpiresAt = new Date(input.capturedAt.getTime() + VALIDITY_MS);

  // Rule 4: expires_at <= now means NOT eligible, even though nothing else above may have failed —
  // `>=` so "expires_at exactly equal to now" already counts as expired (boundary requirement).
  if (input.now.getTime() >= verificationExpiresAt.getTime()) {
    reasonCodes.push('ALREADY_EXPIRED');
  }

  const eligible = reasonCodes.length === 0;
  return {
    eligible,
    reasonCodes: eligible ? ['ELIGIBLE'] : reasonCodes,
    policyKey: OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_KEY,
    policyVersion: OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_VERSION,
    verificationExpiresAt,
  };
}
