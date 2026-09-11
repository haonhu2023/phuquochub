import { SourceType } from '../../sources/sources.enums';
import {
  evaluateOpeningHoursFieldBoundV2,
  OPENING_HOURS_FIELD_BOUND_V2_POLICY_KEY,
  OPENING_HOURS_FIELD_BOUND_V2_POLICY_VERSION,
  type FieldBoundPolicyEvaluationInput,
} from './opening-hours-field-bound-v2.policy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function baseInput(overrides: Partial<FieldBoundPolicyEvaluationInput> = {}): FieldBoundPolicyEvaluationInput {
  const capturedAt = new Date('2026-09-01T00:00:00.000Z');
  const reviewedAt = new Date(capturedAt.getTime() + 1 * HOUR_MS);
  const evidenceHash = 'a'.repeat(64);
  const fieldHash = 'd'.repeat(64);
  return {
    claimType: 'opening_hours',
    sourceType: SourceType.OFFICIAL_WEBSITE,
    scheduleStability: 'STABLE',
    capturedAt,
    reviewedAt,
    now: reviewedAt,
    currentEvidenceContentHash: evidenceHash,
    approvalBoundEvidenceHash: evidenceHash,
    decision: 'APPROVE',
    fieldName: 'opening_hours',
    approvalBoundFieldValueHash: fieldHash,
    currentFieldValueHash: fieldHash,
    ...overrides,
  };
}

describe('evaluateOpeningHoursFieldBoundV2', () => {
  it('is eligible when every V1 rule AND the exact field binding pass', () => {
    const result = evaluateOpeningHoursFieldBoundV2(baseInput());
    expect(result.eligible).toBe(true);
    expect(result.reasonCodes).toEqual(['ELIGIBLE']);
    expect(result.policyKey).toBe(OPENING_HOURS_FIELD_BOUND_V2_POLICY_KEY);
    expect(result.policyVersion).toBe(OPENING_HOURS_FIELD_BOUND_V2_POLICY_VERSION);
  });

  it('exposes distinct policy identity from V1', () => {
    expect(OPENING_HOURS_FIELD_BOUND_V2_POLICY_KEY).toBe('OPENING_HOURS_FIELD_BOUND_V2');
    expect(OPENING_HOURS_FIELD_BOUND_V2_POLICY_VERSION).toBe('2');
  });

  describe('field binding', () => {
    it('approvalBoundFieldValueHash different from the CURRENT field value hash -> FAIL (FIELD_VALUE_HASH_MISMATCH)', () => {
      const result = evaluateOpeningHoursFieldBoundV2(
        baseInput({ approvalBoundFieldValueHash: 'd'.repeat(64), currentFieldValueHash: 'e'.repeat(64) }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('FIELD_VALUE_HASH_MISMATCH');
    });

    it('fieldName other than opening_hours -> FAIL (FIELD_NAME_UNSUPPORTED) — this policy version covers no other field', () => {
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ fieldName: 'short_description' }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('FIELD_NAME_UNSUPPORTED');
    });

    it('a place whose value has since changed (server recomputes a different current hash than what the receipt attests) -> FAIL, same as a stale binding', () => {
      // Simulates: receipt approved value A (approvalBoundFieldValueHash = hash(A)); by review time
      // the place's live value is B — the service independently recomputed currentFieldValueHash =
      // hash(B), never trusting the receipt's own claim.
      const result = evaluateOpeningHoursFieldBoundV2(
        baseInput({ approvalBoundFieldValueHash: 'a'.repeat(64), currentFieldValueHash: 'b'.repeat(64) }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('FIELD_VALUE_HASH_MISMATCH');
    });
  });

  describe('V1 rules still apply unchanged, composed rather than duplicated', () => {
    it('non-first-party source still fails SOURCE_NOT_FIRST_PARTY even when the field binding is exact', () => {
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ sourceType: SourceType.COMMUNITY }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('SOURCE_NOT_FIRST_PARTY');
    });

    it('capture older than 168h still fails CAPTURE_TOO_OLD', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + 169 * HOUR_MS);
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('CAPTURE_TOO_OLD');
    });

    it('evidence content hash mismatch still fails EVIDENCE_HASH_MISMATCH', () => {
      const result = evaluateOpeningHoursFieldBoundV2(
        baseInput({ currentEvidenceContentHash: 'a'.repeat(64), approvalBoundEvidenceHash: 'b'.repeat(64) }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('EVIDENCE_HASH_MISMATCH');
    });

    it('decision = REJECT still fails DECISION_NOT_APPROVED, even with an otherwise-exact field binding', () => {
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ decision: 'REJECT' }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('DECISION_NOT_APPROVED');
    });

    it('temporary schedule still fails TEMPORARY_SCHEDULE_UNSUPPORTED', () => {
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ scheduleStability: 'TEMPORARY' }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('TEMPORARY_SCHEDULE_UNSUPPORTED');
    });

    it('verificationExpiresAt = capturedAt + 30 days, identical derivation to V1', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + 3 * DAY_MS);
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.verificationExpiresAt.getTime()).toBe(capturedAt.getTime() + 30 * DAY_MS);
    });

    it('already expired (now >= verificationExpiresAt) -> FAIL (ALREADY_EXPIRED), even with an exact field binding', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + HOUR_MS);
      const now = new Date(capturedAt.getTime() + 30 * DAY_MS);
      const result = evaluateOpeningHoursFieldBoundV2(baseInput({ capturedAt, reviewedAt, now }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('ALREADY_EXPIRED');
    });
  });

  it('collects every applicable failure reason at once, including both V1 and V2-specific ones', () => {
    const result = evaluateOpeningHoursFieldBoundV2(
      baseInput({
        sourceType: SourceType.OTHER,
        decision: 'REJECT',
        fieldName: 'short_description',
        approvalBoundFieldValueHash: 'a'.repeat(64),
        currentFieldValueHash: 'b'.repeat(64),
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['SOURCE_NOT_FIRST_PARTY', 'DECISION_NOT_APPROVED', 'FIELD_NAME_UNSUPPORTED', 'FIELD_VALUE_HASH_MISMATCH']),
    );
  });
});
