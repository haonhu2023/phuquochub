import { SourceType } from '../../sources/sources.enums';
import {
  evaluateOpeningHoursOfficialStableV1,
  MAX_CAPTURE_AGE_HOURS,
  VALIDITY_DAYS,
  OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_KEY,
  OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_VERSION,
  type PolicyEvaluationInput,
} from './opening-hours-official-stable-v1.policy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function baseInput(overrides: Partial<PolicyEvaluationInput> = {}): PolicyEvaluationInput {
  const capturedAt = new Date('2026-09-01T00:00:00.000Z');
  const reviewedAt = new Date(capturedAt.getTime() + 1 * HOUR_MS);
  const hash = 'a'.repeat(64);
  return {
    claimType: 'opening_hours',
    sourceType: SourceType.OFFICIAL_WEBSITE,
    scheduleStability: 'STABLE',
    capturedAt,
    reviewedAt,
    now: reviewedAt,
    currentEvidenceContentHash: hash,
    approvalBoundEvidenceHash: hash,
    decision: 'APPROVE',
    ...overrides,
  };
}

describe('evaluateOpeningHoursOfficialStableV1', () => {
  it('is eligible when every rule passes', () => {
    const result = evaluateOpeningHoursOfficialStableV1(baseInput());
    expect(result.eligible).toBe(true);
    expect(result.reasonCodes).toEqual(['ELIGIBLE']);
    expect(result.policyKey).toBe(OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_KEY);
    expect(result.policyVersion).toBe(OPENING_HOURS_OFFICIAL_STABLE_V1_POLICY_VERSION);
  });

  it('exposes the policy constants exactly as specified (168h / 30d)', () => {
    expect(MAX_CAPTURE_AGE_HOURS).toBe(168);
    expect(VALIDITY_DAYS).toBe(30);
  });

  describe('capture-age boundary (168h)', () => {
    it('exactly 168 hours after capture -> PASS (not CAPTURE_TOO_OLD)', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + 168 * HOUR_MS);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.reasonCodes).not.toContain('CAPTURE_TOO_OLD');
    });

    it('168 hours + 1ms after capture -> FAIL (CAPTURE_TOO_OLD)', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + 168 * HOUR_MS + 1);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('CAPTURE_TOO_OLD');
    });

    it('captured_at in the future -> FAIL (CAPTURE_TOO_OLD)', () => {
      const reviewedAt = new Date('2026-09-01T00:00:00.000Z');
      const capturedAt = new Date(reviewedAt.getTime() + HOUR_MS);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('CAPTURE_TOO_OLD');
    });
  });

  describe('validity window (30 days from captured_at)', () => {
    it('verificationExpiresAt = capturedAt + 30 days exactly, never derived from reviewedAt', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + 3 * DAY_MS); // reviewed 3 days later
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now: reviewedAt }));
      expect(result.verificationExpiresAt.getTime()).toBe(capturedAt.getTime() + 30 * DAY_MS);
    });

    it('now exactly equal to expires_at -> ALREADY_EXPIRED', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + HOUR_MS);
      const expiresAt = new Date(capturedAt.getTime() + 30 * DAY_MS);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now: expiresAt }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('ALREADY_EXPIRED');
    });

    it('now 1ms before expires_at -> not expired', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + HOUR_MS);
      const now = new Date(capturedAt.getTime() + 30 * DAY_MS - 1);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now }));
      expect(result.reasonCodes).not.toContain('ALREADY_EXPIRED');
      expect(result.eligible).toBe(true);
    });

    it('now 1ms after expires_at -> expired', () => {
      const capturedAt = new Date('2026-09-01T00:00:00.000Z');
      const reviewedAt = new Date(capturedAt.getTime() + HOUR_MS);
      const now = new Date(capturedAt.getTime() + 30 * DAY_MS + 1);
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ capturedAt, reviewedAt, now }));
      expect(result.reasonCodes).toContain('ALREADY_EXPIRED');
    });
  });

  it('search/aggregator/non-first-party source -> FAIL (SOURCE_NOT_FIRST_PARTY)', () => {
    const result = evaluateOpeningHoursOfficialStableV1(baseInput({ sourceType: SourceType.GOOGLE_MAPS }));
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain('SOURCE_NOT_FIRST_PARTY');
  });

  it('community/facebook/ai sources also fail SOURCE_NOT_FIRST_PARTY', () => {
    for (const sourceType of [SourceType.FACEBOOK, SourceType.COMMUNITY, SourceType.AI, SourceType.OTHER]) {
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ sourceType }));
      expect(result.reasonCodes).toContain('SOURCE_NOT_FIRST_PARTY');
    }
  });

  it('official_website/business_owner/government sources all pass the source check', () => {
    for (const sourceType of [SourceType.OFFICIAL_WEBSITE, SourceType.BUSINESS_OWNER, SourceType.GOVERNMENT]) {
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ sourceType }));
      expect(result.reasonCodes).not.toContain('SOURCE_NOT_FIRST_PARTY');
    }
  });

  it('temporary/event/holiday schedule -> FAIL (TEMPORARY_SCHEDULE_UNSUPPORTED), held for a future policy', () => {
    const result = evaluateOpeningHoursOfficialStableV1(baseInput({ scheduleStability: 'TEMPORARY' }));
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain('TEMPORARY_SCHEDULE_UNSUPPORTED');
  });

  it('approval-bound hash different from current evidence hash -> FAIL (EVIDENCE_HASH_MISMATCH)', () => {
    const result = evaluateOpeningHoursOfficialStableV1(
      baseInput({ currentEvidenceContentHash: 'a'.repeat(64), approvalBoundEvidenceHash: 'b'.repeat(64) }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain('EVIDENCE_HASH_MISMATCH');
  });

  it('claim_type other than opening_hours -> FAIL (CLAIM_TYPE_UNSUPPORTED)', () => {
    const result = evaluateOpeningHoursOfficialStableV1(baseInput({ claimType: 'price_range' }));
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain('CLAIM_TYPE_UNSUPPORTED');
  });

  describe('human approval', () => {
    it('no decision recorded at all -> HUMAN_APPROVAL_REQUIRED (distinct from an explicit non-approve decision)', () => {
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ decision: null }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('HUMAN_APPROVAL_REQUIRED');
      expect(result.reasonCodes).not.toContain('DECISION_NOT_APPROVED');
    });

    it('decision = NEEDS_CHANGES -> DECISION_NOT_APPROVED', () => {
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ decision: 'NEEDS_CHANGES' }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('DECISION_NOT_APPROVED');
      expect(result.reasonCodes).not.toContain('HUMAN_APPROVAL_REQUIRED');
    });

    it('decision = REJECT -> DECISION_NOT_APPROVED', () => {
      const result = evaluateOpeningHoursOfficialStableV1(baseInput({ decision: 'REJECT' }));
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('DECISION_NOT_APPROVED');
    });

    it('human approval failures are never bypassed by an APPROVE decision — every other failing gate still reports', () => {
      // Rule 7: hash mismatch + APPROVE must still fail, with the concrete reason surfaced.
      const result = evaluateOpeningHoursOfficialStableV1(
        baseInput({ decision: 'APPROVE', currentEvidenceContentHash: 'a'.repeat(64), approvalBoundEvidenceHash: 'b'.repeat(64) }),
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('EVIDENCE_HASH_MISMATCH');
    });
  });

  it('collects every applicable failure reason at once, not just the first', () => {
    const result = evaluateOpeningHoursOfficialStableV1(
      baseInput({
        claimType: 'price_range',
        scheduleStability: 'TEMPORARY',
        sourceType: SourceType.OTHER,
        decision: 'REJECT',
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['CLAIM_TYPE_UNSUPPORTED', 'TEMPORARY_SCHEDULE_UNSUPPORTED', 'SOURCE_NOT_FIRST_PARTY', 'DECISION_NOT_APPROVED']),
    );
  });
});
