import type { PolicyEvaluationInput, PolicyEvaluationResult, PolicyReasonCode } from './opening-hours-official-stable-v1.policy';
import { evaluateOpeningHoursOfficialStableV1 } from './opening-hours-official-stable-v1.policy';

// OPENING_HOURS_FIELD_BOUND_V2 — closes the "known limitation" ADR-022 itself documents: an
// OPENING_HOURS_OFFICIAL_STABLE_V1 review approves an evidence_artifacts row's CONTENT, not any
// specific (place, field, value) it is later linked to. This policy is V1 PLUS an exact binding —
// every V1 rule still applies unchanged (composes evaluateOpeningHoursOfficialStableV1, does not
// duplicate it), so a V2 review that fails a V1 gate (stale capture, non-first-party source, hash
// mismatch, temporary schedule, expiry) reports those same reason codes. V2 adds exactly two new
// ways to fail: the bound field must be `opening_hours` (this policy version covers no other field,
// same "no other claim type in scope" rule V1 already applies to claimType), and the field VALUE
// hash the approval receipt attests to must match the CURRENT value the service independently
// computed — never the caller's assertion alone (EvidenceService.reviewEvidenceArtifact resolves
// the place's live value itself; a caller-supplied hash is only ever compared against that, never
// trusted on its own).
export const OPENING_HOURS_FIELD_BOUND_V2_POLICY_KEY = 'OPENING_HOURS_FIELD_BOUND_V2';
export const OPENING_HOURS_FIELD_BOUND_V2_POLICY_VERSION = '2';

export type FieldBoundPolicyReasonCode = PolicyReasonCode | 'FIELD_NAME_UNSUPPORTED' | 'FIELD_VALUE_HASH_MISMATCH';

export interface FieldBoundPolicyEvaluationInput extends PolicyEvaluationInput {
  /** The place_field_evidence_links-style field name this review is bound to. */
  fieldName: string;
  /** The field_value_hash the human approval receipt attests it reviewed. */
  approvalBoundFieldValueHash: string;
  /**
   * computeFieldValueHash(CURRENT place.<fieldName>), resolved by the service itself at review
   * time — never the caller's own claim. A mismatch here means the receipt approved a value the
   * field no longer holds (or never held), and must never become eligible for the operational gate.
   */
  currentFieldValueHash: string;
}

export interface FieldBoundPolicyEvaluationResult extends Omit<PolicyEvaluationResult, 'reasonCodes'> {
  reasonCodes: FieldBoundPolicyReasonCode[];
}

export function evaluateOpeningHoursFieldBoundV2(input: FieldBoundPolicyEvaluationInput): FieldBoundPolicyEvaluationResult {
  const base = evaluateOpeningHoursOfficialStableV1(input);
  const reasonCodes: FieldBoundPolicyReasonCode[] = base.eligible ? [] : [...base.reasonCodes];

  if (input.fieldName !== 'opening_hours') {
    reasonCodes.push('FIELD_NAME_UNSUPPORTED');
  }
  if (input.approvalBoundFieldValueHash !== input.currentFieldValueHash) {
    reasonCodes.push('FIELD_VALUE_HASH_MISMATCH');
  }

  const eligible = reasonCodes.length === 0;
  return {
    eligible,
    reasonCodes: eligible ? ['ELIGIBLE'] : reasonCodes,
    policyKey: OPENING_HOURS_FIELD_BOUND_V2_POLICY_KEY,
    policyVersion: OPENING_HOURS_FIELD_BOUND_V2_POLICY_VERSION,
    verificationExpiresAt: base.verificationExpiresAt,
  };
}
