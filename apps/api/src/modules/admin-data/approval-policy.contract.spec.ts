import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAXIMUM_CLOCK_SKEW_CAP_MS,
  MAXIMUM_EVIDENCE_AGE_CAP_MS,
  VERIFIED_TIME_WINDOW_CAP_MS,
  evaluateApprovalEvidencePolicy,
  type ApprovalEvidencePolicyErrorCode,
  type ApprovalEvidencePolicyResult,
  type VerifiedTimeSource,
} from './approval-policy.contract';
import {
  computeApprovalEvidenceDigest,
  type ApprovalEvidencePayloadV1,
} from './approval-evidence.contract';
import {
  buildNormalizedReviewRecord,
  computeReviewRecordDigest,
} from './approval-review-record.contract';

// =================================================================================================
// Fixtures
// =================================================================================================

function buildRawEvidence(
  overrides: Partial<ApprovalEvidencePayloadV1> = {},
): ApprovalEvidencePayloadV1 {
  return {
    evidenceVersion: 1,
    policyVersion: 1,
    manifestId: 'batch-2026-08-25-001',
    manifestChecksum: 'a'.repeat(64),
    targetEnvironment: 'production',
    repositoryId: '1297370007',
    repositoryOwnerId: '302432067',
    commitSha: 'a'.repeat(40),
    workflowRef: 'haonhu2023/phuquochub/.github/workflows/publish-approval.yml@refs/heads/main',
    workflowSha: 'b'.repeat(40),
    runId: '123456789',
    runAttempt: 1,
    environmentId: '987654321',
    reviewState: 'approved',
    approverProvider: 'github',
    approverSubjectId: '111222333',
    reviewObservedAt: '2026-08-25T10:00:00.000Z',
    reviewRecordDigest: 'placeholder-will-be-recomputed',
    rawReviewResponseDigest: 'd'.repeat(64),
    reason: 'Canary batch approved after manual review.',
    issuer: 'haonhu2023/phuquochub/.github/workflows/publish-approval.yml',
    issuedAt: '2026-08-25T10:00:05.000Z',
    notBefore: '2026-08-25T10:00:00.000Z',
    notAfter: '2026-08-26T10:00:00.000Z',
    repositoryFullName: 'haonhu2023/phuquochub',
    environmentName: 'production-data',
    approverLogin: 'haonhu2023',
    ...overrides,
  };
}

/**
 * Evidence hợp lệ với `reviewRecordDigest` TỰ ĐỘNG tính đúng từ chính payload — trừ khi caller
 * override `reviewRecordDigest` tường minh (dùng cho test cố ý làm digest sai).
 */
function buildValidEvidence(
  overrides: Partial<ApprovalEvidencePayloadV1> = {},
): ApprovalEvidencePayloadV1 {
  const raw = buildRawEvidence(overrides);
  if (Object.prototype.hasOwnProperty.call(overrides, 'reviewRecordDigest')) {
    return raw;
  }
  return { ...raw, reviewRecordDigest: computeReviewRecordDigest(buildNormalizedReviewRecord(raw)) };
}

function buildValidObservations(
  evidence: ApprovalEvidencePayloadV1,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    observationsVersion: 1,
    manifestId: evidence.manifestId,
    manifestChecksum: evidence.manifestChecksum,
    targetEnvironment: evidence.targetEnvironment,
    expectedCommitSha: evidence.commitSha,
    evidenceSha256: computeApprovalEvidenceDigest(evidence),
    ...overrides,
  };
}

function buildValidFacts(
  evidence: ApprovalEvidencePayloadV1,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    factsVersion: 1,
    subjectDigest: computeApprovalEvidenceDigest(evidence),
    verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
    verifiedTimeNotAfter: '2026-08-25T10:00:00.000Z',
    verifiedTimeSource: 'rfc3161-tsa' as VerifiedTimeSource,
    verifiedIssuer: 'https://token.actions.githubusercontent.com',
    verifiedRepositoryId: evidence.repositoryId,
    verifiedRepositoryOwnerId: evidence.repositoryOwnerId,
    verifiedWorkflowRef: evidence.workflowRef,
    verifiedWorkflowSha: evidence.workflowSha,
    verifiedRunId: evidence.runId,
    verifiedRunAttempt: evidence.runAttempt,
    ...overrides,
  };
}

function buildValidPolicy(
  evidence: ApprovalEvidencePayloadV1,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    policyVersion: evidence.policyVersion,
    repositoryId: evidence.repositoryId,
    repositoryOwnerId: evidence.repositoryOwnerId,
    environmentId: evidence.environmentId,
    targetEnvironment: evidence.targetEnvironment,
    allowedWorkflowRefs: [evidence.workflowRef],
    allowedIssuers: [evidence.issuer],
    allowedAttestationIssuers: ['https://token.actions.githubusercontent.com'],
    allowedApproverProviders: ['github'],
    allowedApproverSubjectIds: [evidence.approverSubjectId],
    revokedApproverSubjectIds: [],
    acceptedVerifiedTimeSources: [
      'rfc3161-tsa',
      'fulcio-certificate-validity',
      'rekor-signed-entry-timestamp',
    ],
    maximumEvidenceAgeMs: MAXIMUM_EVIDENCE_AGE_CAP_MS,
    allowedClockSkewMs: MAXIMUM_CLOCK_SKEW_CAP_MS,
    maximumVerifiedTimeWindowMs: VERIFIED_TIME_WINDOW_CAP_MS,
    requireAttestedWorkflowShaBinding: false,
    requireAttestedRunBinding: false,
    requireEvidenceWorkflowSha: false,
    ...overrides,
  };
}

interface ContextOverrides {
  evidence?: unknown;
  facts?: unknown;
  policy?: unknown;
  observations?: unknown;
  evaluationTime?: unknown;
}

/** Happy-path context — mọi phần đồng bộ với nhau. */
function buildValidContext(overrides: ContextOverrides = {}): Record<string, unknown> {
  const evidence = (overrides.evidence as ApprovalEvidencePayloadV1) ?? buildValidEvidence();
  return {
    evidence,
    facts: overrides.facts ?? buildValidFacts(evidence),
    policy: overrides.policy ?? buildValidPolicy(evidence),
    observations: overrides.observations ?? buildValidObservations(evidence),
    evaluationTime:
      overrides.evaluationTime !== undefined ? overrides.evaluationTime : '2026-08-25T10:00:00.000Z',
  };
}

function codes(result: ApprovalEvidencePolicyResult): ApprovalEvidencePolicyErrorCode[] {
  return result.ok ? [] : result.violations.map((v) => v.code);
}

const SOURCE = readFileSync(join(__dirname, 'approval-policy.contract.ts'), 'utf8');

function stripComments(source: string): string {
  const blockCommentPattern = new RegExp(['/', '\\*', '[\\s\\S]*?', '\\*', '/'].join(''), 'g');
  const lineCommentPattern = /\/\/.*$/gm;
  return source.replace(blockCommentPattern, '').replace(lineCommentPattern, '');
}

describe('approval-policy.contract', () => {
  // ===============================================================================================
  // 1. Happy path
  // ===============================================================================================
  describe('1. Happy path', () => {
    it('context hợp lệ đầy đủ -> ok:true', () => {
      const result = evaluateApprovalEvidencePolicy(buildValidContext());
      expect(result.ok).toBe(true);
    });

    it('happy path với fulcio-certificate-validity (T_lo < T_hi hợp lệ) -> ok:true', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T09:59:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:01:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: '2026-08-25T10:00:00.000Z' }),
      );
      expect(result.ok).toBe(true);
    });
  });

  // ===============================================================================================
  // 2. reason và reasonDigest
  // ===============================================================================================
  describe('2. reason / reasonDigest', () => {
    it('reasonDigest thay reason -> ok:true (review record digest tính đúng qua nhánh commentDigest)', () => {
      const raw = buildRawEvidence();
      const withoutReason: Record<string, unknown> = { ...raw };
      delete withoutReason.reason;
      const evidenceBase = { ...withoutReason, reasonDigest: 'f'.repeat(64) } as ApprovalEvidencePayloadV1;
      const evidence = {
        ...evidenceBase,
        reviewRecordDigest: computeReviewRecordDigest(buildNormalizedReviewRecord(evidenceBase)),
      };
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence }));
      expect(result.ok).toBe(true);
    });
  });

  // ===============================================================================================
  // 3. Regression D1 extraction — không kiểm lại toàn bộ D1 ở đây (đã có file riêng); chỉ xác nhận
  //    happy path D2 dùng ĐÚNG isCanonicalDecimalString đã trích ra common/ (gián tiếp qua ID lớn).
  // ===============================================================================================
  describe('3. D1 extraction — dùng chung isCanonicalDecimalString', () => {
    it('ID vượt Number.MAX_SAFE_INTEGER trong CẢ evidence lẫn policy lẫn facts -> ok:true (không parse number)', () => {
      const huge = '99999999999999999999999999';
      const evidence = buildValidEvidence({ repositoryId: huge });
      const context = buildValidContext({
        evidence,
        facts: buildValidFacts(evidence, { verifiedRepositoryId: huge }),
        policy: buildValidPolicy(evidence, { repositoryId: huge }),
      });
      const result = evaluateApprovalEvidencePolicy(context);
      expect(result.ok).toBe(true);
    });
  });

  // ===============================================================================================
  // 4. Decimal utility đầy đủ — kiểm GIÁN TIẾP qua policy.repositoryId (utility tự có spec riêng)
  // ===============================================================================================
  describe('4. Canonical decimal string qua policy', () => {
    it.each(['0', '01', '+1', '-1', ' 1', '1e3'])(
      'policy.repositoryId = "%s" -> E_POLICY_MALFORMED',
      (bad) => {
        const evidence = buildValidEvidence();
        const result = evaluateApprovalEvidencePolicy(
          buildValidContext({ evidence, policy: buildValidPolicy(evidence, { repositoryId: bad }) }),
        );
        expect(result.ok).toBe(false);
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
      },
    );
  });

  // ===============================================================================================
  // 5-6. Closed schema / unknown keys
  // ===============================================================================================
  describe('5-6. Closed schema / unknown keys', () => {
    it('policy có khoá lạ -> E_POLICY_MALFORMED', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence, { notAllowedField: 'x' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).toContain('E_POLICY_MALFORMED');
    });

    it('facts có khoá lạ -> E_FACTS_MALFORMED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { notAllowedField: 'x' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_FACTS_MALFORMED');
    });

    it('observations có khoá lạ -> E_OBSERVATIONS_MALFORMED', () => {
      const evidence = buildValidEvidence();
      const observations = buildValidObservations(evidence, { notAllowedField: 'x' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, observations }));
      expect(codes(result)).toContain('E_OBSERVATIONS_MALFORMED');
    });

    it('policy thiếu allowedClockSkewMs -> E_POLICY_MALFORMED (không default)', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence);
      delete policy.allowedClockSkewMs;
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).toContain('E_POLICY_MALFORMED');
    });

    it('allow-list rỗng (allowedApproverSubjectIds) -> E_POLICY_MALFORMED', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence, { allowedApproverSubjectIds: [] });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).toContain('E_POLICY_MALFORMED');
    });

    it('revokedApproverSubjectIds RỖNG -> hợp lệ (ngoại lệ duy nhất được rỗng)', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence, { revokedApproverSubjectIds: [] });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(result.ok).toBe(true);
    });
  });

  // ===============================================================================================
  // 7. Accessor / getter / Proxy
  // ===============================================================================================
  describe('7. Accessor / getter / Proxy safety', () => {
    it('evidence có getter ném -> E_ACCESSOR_PROPERTY_REJECTED, getter KHÔNG bị gọi, không throw', () => {
      // Dựng context SẠCH trước (facts/observations/policy tính từ evidence SẠCH) — chỉ sau đó mới
      // thay context.evidence bằng bản có getter độc, để tránh chính fixture builder của TEST vô
      // tình đọc getter (đó sẽ là lỗi test, không phải lỗi hàm đang kiểm).
      const cleanEvidence = buildValidEvidence();
      const context = buildValidContext({ evidence: cleanEvidence });
      const spy = jest.fn(() => {
        throw new Error('getter should never be invoked');
      });
      const evilEvidence: Record<string, unknown> = { ...cleanEvidence };
      Object.defineProperty(evilEvidence, 'evidenceVersion', {
        get: spy,
        enumerable: true,
        configurable: true,
      });
      context.evidence = evilEvidence;

      let result: ApprovalEvidencePolicyResult | undefined;
      expect(() => {
        result = evaluateApprovalEvidencePolicy(context);
      }).not.toThrow();
      expect(spy).not.toHaveBeenCalled();
      expect(result!.ok).toBe(false);
      expect(codes(result!)).toContain('E_ACCESSOR_PROPERTY_REJECTED');
    });

    it('policy có getter ném trên field mảng -> E_ACCESSOR_PROPERTY_REJECTED, không throw', () => {
      const evidence = buildValidEvidence();
      const context = buildValidContext({ evidence });
      const evilPolicy: Record<string, unknown> = { ...buildValidPolicy(evidence) };
      Object.defineProperty(evilPolicy, 'allowedWorkflowRefs', {
        get() {
          throw new Error('should not be invoked');
        },
        enumerable: true,
        configurable: true,
      });
      context.policy = evilPolicy;

      let result: ApprovalEvidencePolicyResult | undefined;
      expect(() => {
        result = evaluateApprovalEvidencePolicy(context);
      }).not.toThrow();
      expect(result!.ok).toBe(false);
      expect(codes(result!)).toContain('E_ACCESSOR_PROPERTY_REJECTED');
    });

    it('Proxy bẫy getOwnPropertyDescriptor và ném -> backstop E_CONTEXT_INVALID, không throw', () => {
      const context = buildValidContext();
      const evilProxy = new Proxy(context, {
        getOwnPropertyDescriptor() {
          throw new Error('proxy trap');
        },
      });
      let result: ApprovalEvidencePolicyResult | undefined;
      expect(() => {
        result = evaluateApprovalEvidencePolicy(evilProxy);
      }).not.toThrow();
      expect(result!.ok).toBe(false);
      expect(codes(result!)).toEqual(['E_CONTEXT_INVALID']);
    });

    it('input rác (null/undefined/[]/number/string) -> luôn ok:false, không throw', () => {
      for (const bad of [null, undefined, [], 42, 'string', true, {}]) {
        expect(() => evaluateApprovalEvidencePolicy(bad)).not.toThrow();
        const result = evaluateApprovalEvidencePolicy(bad);
        expect(result.ok).toBe(false);
      }
    });
  });

  // ===============================================================================================
  // 8. Mandatory repository/owner/workflow binding (Correction 1)
  // ===============================================================================================
  describe('8. Mandatory attested identity binding', () => {
    it('facts.verifiedRepositoryId = null -> E_ATTESTED_IDENTITY_MISSING (không phải MALFORMED)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRepositoryId: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTED_IDENTITY_MISSING');
      expect(codes(result)).not.toContain('E_FACTS_MALFORMED');
    });

    it('facts.verifiedRepositoryId thiếu key hoàn toàn -> E_ATTESTED_IDENTITY_MISSING', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence);
      delete facts.verifiedRepositoryId;
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTED_IDENTITY_MISSING');
    });

    it('facts.verifiedRepositoryId = "abc" (có mặt, sai hình dạng) -> E_FACTS_MALFORMED (không phải MISSING)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRepositoryId: 'abc' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_FACTS_MALFORMED');
      expect(codes(result)).not.toContain('E_ATTESTED_IDENTITY_MISSING');
    });

    it('facts.verifiedRepositoryOwnerId null -> E_ATTESTED_IDENTITY_MISSING', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRepositoryOwnerId: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTED_IDENTITY_MISSING');
    });

    it('facts.verifiedWorkflowRef null -> E_ATTESTED_IDENTITY_MISSING', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedWorkflowRef: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTED_IDENTITY_MISSING');
    });

    it('không có policy flag nào tắt được binding này (policy không chứa requireAttestedRepositoryBinding)', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(policy, 'requireAttestedRepositoryBinding')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(policy, 'requireAttestedWorkflowRefBinding')).toBe(false);
    });

    it('facts.verifiedRepositoryId có mặt nhưng LỆCH policy.repositoryId -> E_ATTESTED_REPOSITORY_ID_MISMATCH', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRepositoryId: '999999999' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTED_REPOSITORY_ID_MISMATCH');
    });

    it('facts.verifiedIssuer hợp lệ nhưng KHÔNG thuộc allowedAttestationIssuers -> E_ATTESTATION_ISSUER_NOT_ALLOWED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedIssuer: 'https://evil.example.com' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTATION_ISSUER_NOT_ALLOWED');
    });
  });

  // ===============================================================================================
  // 9. Workflow allow-list transitivity (A10)
  // ===============================================================================================
  describe('9. Workflow ref transitivity', () => {
    it('allowedWorkflowRefs có HAI entry; evidence khai entry-1, facts khai entry-2 (cả hai đều trong list) -> E_WORKFLOW_REF_ATTESTATION_MISMATCH', () => {
      const workflowRef1 = 'owner/repo/.github/workflows/a.yml@refs/heads/main';
      const workflowRef2 = 'owner/repo/.github/workflows/b.yml@refs/heads/main';
      const evidence = buildValidEvidence({ workflowRef: workflowRef1, issuer: workflowRef1 });
      const facts = buildValidFacts(evidence, { verifiedWorkflowRef: workflowRef2 });
      const policy = buildValidPolicy(evidence, {
        allowedWorkflowRefs: [workflowRef1, workflowRef2],
        allowedIssuers: [workflowRef1],
      });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts, policy }));
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_WORKFLOW_REF_ATTESTATION_MISMATCH');
      // Cả A<->C và B<->C đều PASS riêng lẻ — chỉ A<->B trực tiếp mới bắt được lỗ transitivity này.
      expect(codes(result)).not.toContain('E_WORKFLOW_REF_NOT_ALLOWED');
      expect(codes(result)).not.toContain('E_ATTESTED_WORKFLOW_REF_NOT_ALLOWED');
    });
  });

  // ===============================================================================================
  // 10. Issuer malformed khác issuer not-allowed
  // ===============================================================================================
  describe('10. Issuer malformed vs not-allowed', () => {
    it('facts.verifiedIssuer không phải string -> E_FACTS_MALFORMED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedIssuer: 12345 });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_FACTS_MALFORMED');
      expect(codes(result)).not.toContain('E_ATTESTATION_ISSUER_NOT_ALLOWED');
    });

    it('facts.verifiedIssuer là chuỗi hợp lệ nhưng KHÔNG thuộc allow-list -> E_ATTESTATION_ISSUER_NOT_ALLOWED (không MALFORMED)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedIssuer: 'https://not-allowed.example.com' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_ATTESTATION_ISSUER_NOT_ALLOWED');
      expect(codes(result)).not.toContain('E_FACTS_MALFORMED');
    });
  });

  // ===============================================================================================
  // 11. Display-only fixture — cập nhật CẢ observations.evidenceSha256 lẫn facts.subjectDigest
  // ===============================================================================================
  describe('11. Display-only fields', () => {
    it.each(['approverLogin', 'repositoryFullName', 'environmentName', 'rawReviewResponseDigest'] as const)(
      'đổi %s (kèm cập nhật ĐÚNG cả evidenceSha256 và subjectDigest) -> ok:true',
      (field) => {
        const overrideValues: Record<string, string> = {
          approverLogin: 'a-completely-different-login',
          repositoryFullName: 'someone-else/other-repo',
          environmentName: 'a-completely-different-environment-name',
          rawReviewResponseDigest: 'e'.repeat(64),
        };
        const evidence = buildValidEvidence({ [field]: overrideValues[field] } as never);
        // buildValidObservations/buildValidFacts tự tính lại digest từ evidence MỚI — đúng khuôn
        // "cập nhật cả hai" mà Correction 6 yêu cầu.
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence }));
        expect(result.ok).toBe(true);
      },
    );

    it('BẪY: chỉ cập nhật observations.evidenceSha256, QUÊN facts.subjectDigest -> E_SUBJECT_DIGEST_MISMATCH (mô phỏng artifact khác đã attest, chỉ khác display-only)', () => {
      const staleEvidence = buildValidEvidence();
      const staleFacts = buildValidFacts(staleEvidence); // facts.subjectDigest ứng với evidence CŨ

      const freshEvidence = buildValidEvidence({ approverLogin: 'someone-else' });
      const freshObservations = buildValidObservations(freshEvidence); // evidenceSha256 ứng với evidence MỚI

      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence: freshEvidence, facts: staleFacts, observations: freshObservations }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_SUBJECT_DIGEST_MISMATCH');
    });
  });

  // ===============================================================================================
  // 12. reason fixture — cập nhật reviewRecordDigest + evidenceSha256 + subjectDigest (BA thứ, khác nhóm 11)
  // ===============================================================================================
  describe('12. reason (audit-only nhưng ảnh hưởng review record digest)', () => {
    it('đổi reason (kèm cập nhật ĐÚNG reviewRecordDigest + evidenceSha256 + subjectDigest) -> ok:true', () => {
      const evidence = buildValidEvidence({ reason: 'Một lý do hoàn toàn khác.' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence }));
      expect(result.ok).toBe(true);
    });

    it('đổi reason nhưng KHÔNG cập nhật reviewRecordDigest -> E_REVIEW_RECORD_DIGEST_MISMATCH', () => {
      const raw = buildRawEvidence({ reason: 'Một lý do khác.' });
      // reviewRecordDigest CỐ Ý giữ nguyên digest của reason CŨ (không recompute).
      const stale = buildValidEvidence();
      const evidence = { ...raw, reviewRecordDigest: stale.reviewRecordDigest };
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence }));
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_REVIEW_RECORD_DIGEST_MISMATCH');
    });

    it('evidence.approverSubjectId trong payload KHÁC giá trị dùng để tính reviewRecordDigest -> E_REVIEW_RECORD_DIGEST_MISMATCH', () => {
      const raw = buildRawEvidence();
      const digestForDifferentApprover = computeReviewRecordDigest(
        buildNormalizedReviewRecord({ ...raw, approverSubjectId: '999999999' }),
      );
      const evidence = { ...raw, reviewRecordDigest: digestForDifferentApprover };
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence }));
      expect(codes(result)).toContain('E_REVIEW_RECORD_DIGEST_MISMATCH');
    });
  });

  // ===============================================================================================
  // 13. Canonical / raw-byte mismatch
  // ===============================================================================================
  describe('13. Exact-byte checks', () => {
    it('observations.evidenceSha256 khớp facts.subjectDigest nhưng KHÔNG khớp canonical digest thật -> E_EVIDENCE_BYTES_NOT_CANONICAL (mô phỏng file trên đĩa pretty-printed)', () => {
      const evidence = buildValidEvidence();
      const wrongDigest = 'f'.repeat(64);
      const observations = buildValidObservations(evidence, { evidenceSha256: wrongDigest });
      const facts = buildValidFacts(evidence, { subjectDigest: wrongDigest });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, observations, facts }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_EVIDENCE_BYTES_NOT_CANONICAL');
      expect(codes(result)).not.toContain('E_SUBJECT_DIGEST_MISMATCH');
    });

    it('observations.evidenceSha256 KHÁC facts.subjectDigest -> E_SUBJECT_DIGEST_MISMATCH', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { subjectDigest: 'f'.repeat(64) });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_SUBJECT_DIGEST_MISMATCH');
    });
  });

  // ===============================================================================================
  // 14. Numeric ID > Number.MAX_SAFE_INTEGER (đã kiểm thêm ở mục 3, đây kiểm approverSubjectId)
  // ===============================================================================================
  describe('14. Numeric ID lớn', () => {
    it('approverSubjectId vượt Number.MAX_SAFE_INTEGER trong allow-list -> ok:true (so chuỗi, không parse)', () => {
      const huge = '9007199254740993'; // 2^53 + 1
      const evidence = buildValidEvidence({ approverSubjectId: huge });
      const policy = buildValidPolicy(evidence, { allowedApproverSubjectIds: [huge] });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(result.ok).toBe(true);
    });

    it('hai ID > 2^53 chỉ khác chữ số cuối -> phân biệt được (không khớp allow-list)', () => {
      const idA = '9007199254740993';
      const idB = '9007199254740994';
      const evidence = buildValidEvidence({ approverSubjectId: idA });
      const policy = buildValidPolicy(evidence, { allowedApproverSubjectIds: [idB] });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).toContain('E_APPROVER_NOT_ALLOWED');
    });
  });

  // ===============================================================================================
  // 15. Optional workflow/run bindings
  // ===============================================================================================
  describe('15. Optional workflow/run bindings', () => {
    it('workflowSha mismatch (cả hai bên non-null, khác nhau) -> E_WORKFLOW_SHA_MISMATCH', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedWorkflowSha: 'c'.repeat(40) });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_WORKFLOW_SHA_MISMATCH');
    });

    it('evidence.workflowSha null, facts.verifiedWorkflowSha null, require=false -> ok:true, KHÔNG mismatch (P4)', () => {
      const evidence = buildValidEvidence({ workflowSha: null });
      const facts = buildValidFacts(evidence, { verifiedWorkflowSha: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(result.ok).toBe(true);
    });

    it('evidence.workflowSha null + policy.requireEvidenceWorkflowSha=true -> E_WORKFLOW_SHA_MISSING', () => {
      const evidence = buildValidEvidence({ workflowSha: null });
      const facts = buildValidFacts(evidence, { verifiedWorkflowSha: null });
      const policy = buildValidPolicy(evidence, { requireEvidenceWorkflowSha: true });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(codes(result)).toContain('E_WORKFLOW_SHA_MISSING');
    });

    it('facts.verifiedWorkflowSha null + policy.requireAttestedWorkflowShaBinding=true -> E_WORKFLOW_SHA_NOT_ATTESTED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedWorkflowSha: null });
      const policy = buildValidPolicy(evidence, { requireAttestedWorkflowShaBinding: true });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(codes(result)).toContain('E_WORKFLOW_SHA_NOT_ATTESTED');
    });

    it('runAttempt mismatch (cả hai bên non-null) -> E_RUN_ATTEMPT_MISMATCH', () => {
      const evidence = buildValidEvidence({ runAttempt: 1 });
      const facts = buildValidFacts(evidence, { verifiedRunAttempt: 2 });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_RUN_ATTEMPT_MISMATCH');
    });
  });

  // ===============================================================================================
  // 16. Run provenance (Correction F2)
  // ===============================================================================================
  describe('16. Run provenance', () => {
    it('require=false, facts đủ và khớp -> ok:true, runBindingVerified:true', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence);
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.runBindingVerified).toBe(true);
        expect(result.attestedRunId).toBe(evidence.runId);
        expect(result.attestedRunAttempt).toBe(evidence.runAttempt);
        expect(result.evidenceRunId).toBe(evidence.runId);
        expect(result.evidenceRunAttempt).toBe(evidence.runAttempt);
      }
    });

    it('require=false, facts.verifiedRunId/verifiedRunAttempt null -> ok:true, runBindingVerified:false, attested*=null', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: null, verifiedRunAttempt: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.runBindingVerified).toBe(false);
        expect(result.attestedRunId).toBeNull();
        expect(result.attestedRunAttempt).toBeNull();
        // evidenceRunId vẫn có mặt nhưng KHÔNG được coi là verified — chỉ khác tên field đã đủ
        // để phân biệt, bài test này khẳng định giá trị, không khẳng định "diễn giải" (đó là hợp
        // đồng đặt tên, được enforce bởi kiểu học + review code, không phải runtime).
        expect(result.evidenceRunId).toBe(evidence.runId);
      }
    });

    it('require=true, facts thiếu run binding -> E_RUN_BINDING_NOT_ATTESTED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: null, verifiedRunAttempt: null });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: true });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_RUN_BINDING_NOT_ATTESTED');
    });

    it('require=true, facts đủ và khớp -> ok:true, runBindingVerified LUÔN true', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence);
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: true });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.runBindingVerified).toBe(true);
    });
  });

  // ===============================================================================================
  // 16b. Partial run binding pair — phải fail closed (Finding 1 fix, pre-push security review)
  // ===============================================================================================
  describe('16b. Partial run binding pair (fail closed)', () => {
    it('A. verifiedRunId non-null + verifiedRunAttempt null, require=false -> ok:false, CHỈ E_FACTS_MALFORMED, không có mã Stage 5 nào', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunAttempt: null });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: false });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toEqual(['E_FACTS_MALFORMED']);
      expect(codes(result)).not.toContain('E_RUN_BINDING_NOT_ATTESTED');
      expect(codes(result)).not.toContain('E_RUN_ID_MISMATCH');
      expect(codes(result)).not.toContain('E_RUN_ATTEMPT_MISMATCH');
    });

    it('B. verifiedRunId null + verifiedRunAttempt non-null, require=false -> ok:false, CHỈ E_FACTS_MALFORMED, không có mã Stage 5 nào', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: null });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: false });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toEqual(['E_FACTS_MALFORMED']);
      expect(codes(result)).not.toContain('E_RUN_BINDING_NOT_ATTESTED');
      expect(codes(result)).not.toContain('E_RUN_ID_MISMATCH');
      expect(codes(result)).not.toContain('E_RUN_ATTEMPT_MISMATCH');
    });

    it('partial pair KHÔNG phát sinh lỗi kép khi trường còn lại đã sai hình dạng (guard tránh double-report)', () => {
      // verifiedRunId sai hình dạng (không phải canonical, không null) — runIdFieldValid=false,
      // nên guard partial-pair KHÔNG được đánh giá; chỉ lỗi hình dạng của chính verifiedRunId nổ.
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: 'not-canonical', verifiedRunAttempt: null });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(result.ok).toBe(false);
      expect(codes(result)).toEqual(['E_FACTS_MALFORMED']);
    });

    it('C1. cả hai null + require=false -> PASS, runBindingVerified=false, attested*=null (khẳng định lại)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: null, verifiedRunAttempt: null });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: false });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.runBindingVerified).toBe(false);
        expect(result.attestedRunId).toBeNull();
        expect(result.attestedRunAttempt).toBeNull();
      }
    });

    it('C2. cả hai non-null + khớp + require=false -> PASS, runBindingVerified=true (khẳng định lại)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence);
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: false });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.runBindingVerified).toBe(true);
    });

    it('C3. cả hai non-null + lệch (runId) + require=false -> FAIL E_RUN_ID_MISMATCH (khẳng định lại)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: '999999999' });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: false });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_RUN_ID_MISMATCH');
    });

    it('C4. cả hai null + require=true -> FAIL E_RUN_BINDING_NOT_ATTESTED (khẳng định lại)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedRunId: null, verifiedRunAttempt: null });
      const policy = buildValidPolicy(evidence, { requireAttestedRunBinding: true });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_RUN_BINDING_NOT_ATTESTED');
    });
  });

  // ===============================================================================================
  // 17. Time-source semantics (Correction 8)
  // ===============================================================================================
  describe('17. Verified time source semantics', () => {
    it('rfc3161-tsa với T_lo != T_hi -> E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'rfc3161-tsa',
        verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:01.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION');
    });

    it('rekor-signed-entry-timestamp với T_lo != T_hi -> E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'rekor-signed-entry-timestamp',
        verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:01.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION');
    });

    it('fulcio-certificate-validity với T_lo < T_hi -> hợp lệ (không semantics violation)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T09:59:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:01:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).not.toContain('E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION');
    });

    it('T_lo > T_hi -> CHỈ E_VERIFIED_TIME_WINDOW_INVALID nổ (P5: ordering trước, semantics/width bị skip)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'rfc3161-tsa',
        verifiedTimeNotBefore: '2026-08-25T10:00:01.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, facts }));
      expect(codes(result)).toContain('E_VERIFIED_TIME_WINDOW_INVALID');
      expect(codes(result)).not.toContain('E_VERIFIED_TIME_SOURCE_SEMANTICS_VIOLATION');
      expect(codes(result)).not.toContain('E_VERIFIED_TIME_WINDOW_TOO_WIDE');
    });

    it('window rộng hơn maximumVerifiedTimeWindowMs -> E_VERIFIED_TIME_WINDOW_TOO_WIDE', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T00:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-27T00:00:00.000Z', // 48h > 24h cap
      });
      const policy = buildValidPolicy(evidence, { maximumVerifiedTimeWindowMs: VERIFIED_TIME_WINDOW_CAP_MS });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy, evaluationTime: '2026-08-25T00:00:00.000Z' }),
      );
      expect(codes(result)).toContain('E_VERIFIED_TIME_WINDOW_TOO_WIDE');
    });

    it('verifiedTimeSource không thuộc policy.acceptedVerifiedTimeSources -> E_VERIFIED_TIME_SOURCE_NOT_ACCEPTED', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence, { verifiedTimeSource: 'fulcio-certificate-validity' });
      const policy = buildValidPolicy(evidence, { acceptedVerifiedTimeSources: ['rfc3161-tsa'] });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, policy }),
      );
      expect(codes(result)).toContain('E_VERIFIED_TIME_SOURCE_NOT_ACCEPTED');
    });
  });

  // ===============================================================================================
  // 18. Skew 300000 pass; 300001 fail
  // ===============================================================================================
  describe('18. Clock skew cap (Correction 3 — 5 phút, không phải 15)', () => {
    it('policy.allowedClockSkewMs = 300000 -> hợp lệ (không MALFORMED/CAP_EXCEEDED)', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence, { allowedClockSkewMs: 300_000 });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).not.toContain('E_POLICY_MALFORMED');
      expect(codes(result)).not.toContain('E_POLICY_SKEW_CAP_EXCEEDED');
    });

    it('policy.allowedClockSkewMs = 300001 -> E_POLICY_SKEW_CAP_EXCEEDED', () => {
      const evidence = buildValidEvidence();
      const policy = buildValidPolicy(evidence, { allowedClockSkewMs: 300_001 });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
      expect(codes(result)).toContain('E_POLICY_SKEW_CAP_EXCEEDED');
    });

    it('MAXIMUM_CLOCK_SKEW_CAP_MS export đúng 300000 (không phải 900000)', () => {
      expect(MAXIMUM_CLOCK_SKEW_CAP_MS).toBe(300_000);
    });

    it('không còn fixture nào trong spec dùng allowedClockSkewMs=900000 (15 phút)', () => {
      expect(SOURCE.includes('900_000') || SOURCE.includes('900000')).toBe(false);
    });
  });

  // ===============================================================================================
  // 18b. Policy numeric domain — NaN/Infinity/fraction/âm phải MALFORMED, không phải CAP_EXCEEDED
  // ===============================================================================================
  describe('18b. Policy numeric domain', () => {
    const INVALID_NUMBERS: ReadonlyArray<[string, number]> = [
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['số âm', -1],
      ['phân số', 0.5],
    ];

    describe('maximumEvidenceAgeMs', () => {
      it.each(INVALID_NUMBERS)('%s -> E_POLICY_MALFORMED (không phải CAP_EXCEEDED)', (_label, bad) => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { maximumEvidenceAgeMs: bad });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(result.ok).toBe(false);
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
        expect(codes(result)).not.toContain('E_POLICY_AGE_CAP_EXCEEDED');
      });

      it('0 -> E_POLICY_MALFORMED (phải > 0, biên dưới không hợp lệ)', () => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { maximumEvidenceAgeMs: 0 });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
      });

      it('vượt hard cap (86_400_001) -> E_POLICY_AGE_CAP_EXCEEDED, không phải MALFORMED', () => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { maximumEvidenceAgeMs: 86_400_001 });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(codes(result)).toContain('E_POLICY_AGE_CAP_EXCEEDED');
        expect(codes(result)).not.toContain('E_POLICY_MALFORMED');
      });
    });

    describe('allowedClockSkewMs', () => {
      it.each(INVALID_NUMBERS)('%s -> E_POLICY_MALFORMED (không phải CAP_EXCEEDED)', (_label, bad) => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { allowedClockSkewMs: bad });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(result.ok).toBe(false);
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
        expect(codes(result)).not.toContain('E_POLICY_SKEW_CAP_EXCEEDED');
      });

      it('0 -> hợp lệ (skew=0 được phép, khác age/window)', () => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { allowedClockSkewMs: 0 });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(codes(result)).not.toContain('E_POLICY_MALFORMED');
        expect(codes(result)).not.toContain('E_POLICY_SKEW_CAP_EXCEEDED');
      });

      it('-1 -> E_POLICY_MALFORMED (âm bị từ chối dù age/window cũng cấm >=0 khác nhau ở biên 0)', () => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { allowedClockSkewMs: -1 });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
      });
    });

    describe('maximumVerifiedTimeWindowMs', () => {
      it.each(INVALID_NUMBERS)('%s -> E_POLICY_MALFORMED (không phải CAP_EXCEEDED)', (_label, bad) => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { maximumVerifiedTimeWindowMs: bad });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(result.ok).toBe(false);
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
        expect(codes(result)).not.toContain('E_POLICY_VERIFIED_TIME_WINDOW_CAP_EXCEEDED');
      });

      it('0 -> E_POLICY_MALFORMED (phải > 0)', () => {
        const evidence = buildValidEvidence();
        const policy = buildValidPolicy(evidence, { maximumVerifiedTimeWindowMs: 0 });
        const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, policy }));
        expect(codes(result)).toContain('E_POLICY_MALFORMED');
      });

      it('vượt hard cap (86_400_001) -> E_POLICY_VERIFIED_TIME_WINDOW_CAP_EXCEEDED, không phải MALFORMED', () => {
        const evidence = buildValidEvidence();
        const facts = buildValidFacts(evidence, {
          verifiedTimeSource: 'fulcio-certificate-validity',
          verifiedTimeNotBefore: '2026-08-25T00:00:00.000Z',
          verifiedTimeNotAfter: '2026-08-25T00:00:00.000Z',
        });
        const policy = buildValidPolicy(evidence, { maximumVerifiedTimeWindowMs: 86_400_001 });
        const result = evaluateApprovalEvidencePolicy(
          buildValidContext({ evidence, facts, policy }),
        );
        expect(codes(result)).toContain('E_POLICY_VERIFIED_TIME_WINDOW_CAP_EXCEEDED');
        expect(codes(result)).not.toContain('E_POLICY_MALFORMED');
      });
    });
  });

  // ===============================================================================================
  // 19. Đúng 24h pass; vượt 1ms fail
  // ===============================================================================================
  describe('19. Hard cap 24h — biên inclusive', () => {
    it('evaluationTime - verifiedTimeNotBefore === 86_400_000 (đúng 24h) -> ok:true', () => {
      const evidence = buildValidEvidence({
        issuedAt: '2026-08-25T10:00:05.000Z',
        notBefore: '2026-08-25T10:00:00.000Z',
        notAfter: '2026-08-27T10:00:00.000Z',
      });
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: '2026-08-26T10:00:00.000Z' }),
      );
      expect(result.ok).toBe(true);
    });

    it('evaluationTime - verifiedTimeNotBefore === 86_400_001 (vượt 1ms) -> E_EVIDENCE_EXPIRED', () => {
      const evidence = buildValidEvidence({
        issuedAt: '2026-08-25T10:00:05.000Z',
        notBefore: '2026-08-25T10:00:00.000Z',
        notAfter: '2026-08-27T10:00:00.000Z',
      });
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: '2026-08-26T10:00:00.001Z' }),
      );
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_EVIDENCE_EXPIRED');
    });
  });

  // ===============================================================================================
  // 20. Leap day thật/giả
  // ===============================================================================================
  describe('20. Leap day', () => {
    it('2024-02-29 (nhuận thật) -> ok:true', () => {
      const evidence = buildValidEvidence({
        issuedAt: '2024-02-29T00:00:05.000Z',
        notBefore: '2024-02-29T00:00:00.000Z',
        notAfter: '2024-03-01T00:00:00.000Z',
      });
      const facts = buildValidFacts(evidence, {
        verifiedTimeNotBefore: '2024-02-29T00:00:00.000Z',
        verifiedTimeNotAfter: '2024-02-29T00:00:00.000Z',
      });
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: '2024-02-29T00:00:00.000Z' }),
      );
      expect(result.ok).toBe(true);
    });

    it('2025-02-29 (KHÔNG nhuận, rollover) -> E_EVALUATION_TIME_INVALID', () => {
      const context = buildValidContext({ evaluationTime: '2025-02-29T00:00:00.000Z' });
      const result = evaluateApprovalEvidencePolicy(context);
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain('E_EVALUATION_TIME_INVALID');
    });
  });

  // ===============================================================================================
  // 21. Residual clock test — D2 KHÔNG bắt được caller bịa evaluationTime
  // ===============================================================================================
  describe('21. Residual clock risk (Correction 2 — không phải clock-rollback detector)', () => {
    it('evidence thực tế 25h tuổi nhưng caller truyền evaluationTime ở giờ thứ 23 -> ok:true (D2 KHÔNG phát hiện được — giới hạn đã biết, xem header file)', () => {
      const evidence = buildValidEvidence({
        issuedAt: '2026-08-25T10:00:05.000Z',
        notBefore: '2026-08-25T10:00:00.000Z',
        notAfter: '2026-08-28T10:00:00.000Z',
      });
      const facts = buildValidFacts(evidence, {
        verifiedTimeSource: 'fulcio-certificate-validity',
        verifiedTimeNotBefore: '2026-08-25T10:00:00.000Z',
        verifiedTimeNotAfter: '2026-08-25T10:00:00.000Z',
      });
      // Thực tế "bây giờ" (nếu tin được) là 2026-08-26T11:00:00Z (25h sau verifiedTimeNotBefore),
      // nhưng caller (compromised) truyền evaluationTime chỉ 23h sau — vẫn trong hạn 24h theo D2.
      const bogusEvaluationTime = '2026-08-26T09:00:00.000Z'; // 23h sau tLo
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: bogusEvaluationTime }),
      );
      expect(result.ok).toBe(true); // D2 KHÔNG có cách nào phát hiện evaluationTime bị bịa
    });
  });

  // ===============================================================================================
  // 22. Primitive-only frozen result
  // ===============================================================================================
  describe('22. Primitive-only, frozen success result', () => {
    it('mọi giá trị trong success result là primitive; object bị freeze', () => {
      const result = evaluateApprovalEvidencePolicy(buildValidContext());
      expect(result.ok).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      for (const value of Object.values(result)) {
        expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
      }
    });

    it('success result KHÔNG chứa key payload/evidence/facts/policy/observations', () => {
      const result = evaluateApprovalEvidencePolicy(buildValidContext());
      expect(result.ok).toBe(true);
      const keys = Object.keys(result);
      for (const forbidden of ['payload', 'evidence', 'facts', 'policy', 'observations']) {
        expect(keys).not.toContain(forbidden);
      }
    });

    it('gán giá trị mới vào success result không làm đổi giá trị (frozen, strict mode ném hoặc no-op)', () => {
      const result = evaluateApprovalEvidencePolicy(buildValidContext());
      expect(result.ok).toBe(true);
      if (result.ok) {
        const original = result.manifestId;
        try {
          (result as unknown as Record<string, unknown>).manifestId = 'tampered';
        } catch {
          // strict mode: gán vào frozen object ném TypeError — chấp nhận được, vẫn không đổi giá trị.
        }
        expect(result.manifestId).toBe(original);
      }
    });
  });

  // ===============================================================================================
  // 23. Mutate input sau PASS không đổi result (TOCTOU — Correction 5)
  // ===============================================================================================
  describe('23. TOCTOU resistance', () => {
    it('mutate object evidence gốc SAU khi ok:true -> success result không đổi', () => {
      const evidence = buildValidEvidence();
      const context = buildValidContext({ evidence });
      const result = evaluateApprovalEvidencePolicy(context);
      expect(result.ok).toBe(true);
      const before = result.ok ? { ...result } : null;

      (evidence as unknown as Record<string, unknown>).manifestId = 'tampered-after-pass';
      (evidence as unknown as Record<string, unknown>).approverSubjectId = 'tampered';

      expect(result.ok ? result.manifestId : null).toBe(before?.manifestId);
      expect(result.ok ? result.approverSubjectId : null).toBe(before?.approverSubjectId);
    });
  });

  // ===============================================================================================
  // 24. Deterministic error ordering
  // ===============================================================================================
  describe('24. Deterministic ordering', () => {
    it('fixture vi phạm nhiều rule cùng lúc -> mảng code ĐÚNG THỨ TỰ CỐ ĐỊNH, lặp 20 lần vẫn y hệt', () => {
      // evidence hợp lệ + TỰ NHẤT QUÁN (qua Stage 0), nhưng observations/policy bị lệch RIÊNG để
      // tích luỹ nhiều vi phạm độc lập ở Stage 1+ trong cùng một lần gọi (không sửa evidence trực
      // tiếp — sửa evidence sẽ kéo theo observations/policy tự đồng bộ lại qua builder, không tạo
      // được mismatch).
      const evidence = buildValidEvidence();
      const observations = buildValidObservations(evidence, { manifestId: 'a-different-manifest-id' });
      const policy = buildValidPolicy(evidence, { environmentId: '111111111' });
      const context = buildValidContext({ evidence, observations, policy });
      const runs: string[][] = [];
      for (let i = 0; i < 20; i += 1) {
        const result = evaluateApprovalEvidencePolicy(context);
        runs.push(codes(result));
      }
      const first = runs[0];
      expect(first.length).toBeGreaterThan(0);
      for (const run of runs) {
        expect(run).toEqual(first);
      }
    });
  });

  // ===============================================================================================
  // 25. Error redaction
  // ===============================================================================================
  describe('25. Redaction', () => {
    it('fixture có reason chuỗi mốc + digest riêng biệt -> KHÔNG message/field nào chứa giá trị đó', () => {
      const marker = 'SUPER-SECRET-REASON-MARKER-98765';
      const evidence = buildValidEvidence({ reason: marker });
      const observations = buildValidObservations(evidence, { manifestId: 'a-different-manifest-id' });
      const result = evaluateApprovalEvidencePolicy(buildValidContext({ evidence, observations }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const joined = result.violations.map((v) => `${v.field}\n${v.message}`).join('\n');
        expect(joined).not.toContain(marker);
        expect(joined).not.toContain(evidence.approverSubjectId);
        expect(joined).not.toContain(evidence.reviewRecordDigest);
      }
    });
  });

  // ===============================================================================================
  // 26. No Date.now
  // ===============================================================================================
  describe('26. No Date.now', () => {
    it('gọi 2 lần cùng context -> kết quả identical (không đọc đồng hồ ngầm)', () => {
      const context = buildValidContext();
      const r1 = evaluateApprovalEvidencePolicy(context);
      const r2 = evaluateApprovalEvidencePolicy(context);
      expect(r1).toEqual(r2);
    });

    it('source (loại comment) KHÔNG gọi Date.now() hay new Date() không tham số', () => {
      const code = stripComments(SOURCE);
      expect(code).not.toMatch(/Date\.now\(\)/);
      expect(code).not.toMatch(/new Date\(\)/);
    });

    it('evaluationTime đặt xa tương lai -> KHÔNG tự PASS (chứng minh dùng tham số truyền vào, không phải đồng hồ hệ thống thật đang ở 2026)', () => {
      const evidence = buildValidEvidence();
      const facts = buildValidFacts(evidence);
      const farFuture = '2099-01-01T00:00:00.000Z';
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts, evaluationTime: farFuture }),
      );
      expect(result.ok).toBe(false);
      // evaluationTime xa T_lo hơn hard cap 24h -> hết hạn; đồng thời cách rất xa cửa sổ NB/NA của
      // evidence -> vi phạm cả hai. Nếu hàm bí mật đọc Date.now() (đang ở 2026), kết quả sẽ khác.
      expect(codes(result)).toEqual(
        expect.arrayContaining(['E_EVIDENCE_EXPIRED', 'E_OUTSIDE_PRODUCER_VALIDITY_WINDOW']),
      );
    });
  });

  // ===============================================================================================
  // 27. No network/DB/Nest/filesystem/Sigstore import
  // ===============================================================================================
  describe('27. Architecture — import isolation', () => {
    function extractImportStatements(source: string): string[] {
      return source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('import '));
    }

    it('source CHỈ import 2 common utility + 2 file cùng thư mục — đúng 4 dòng, không hơn', () => {
      const importLines = extractImportStatements(SOURCE);
      expect(importLines).toHaveLength(4);
      expect(importLines).toEqual([
        "import { isCanonicalDecimalString } from '../../common/canonical-decimal-string';",
        "import { isValidCanonicalTimestamp } from '../../common/canonical-timestamp';",
        "import { buildNormalizedReviewRecord, computeReviewRecordDigest } from './approval-review-record.contract';",
        "import { computeApprovalEvidenceDigest, validateApprovalEvidence, type ApprovalEvidencePayloadV1 } from './approval-evidence.contract';",
      ]);
    });

    it('không có import nào tới @nestjs/*, typeorm, fs, http, network, DB, sigstore, child_process', () => {
      const importLines = extractImportStatements(SOURCE).join('\n');
      for (const pattern of [
        /from ['"]@nestjs\//,
        /from ['"]typeorm['"]/,
        /from ['"]fs['"]/,
        /from ['"]http['"]/,
        /from ['"]https['"]/,
        /from ['"]axios['"]/,
        /from ['"]child_process['"]/,
        /sigstore/i,
      ]) {
        expect(importLines).not.toMatch(pattern);
      }
    });

    it('source KHÔNG dùng process.env / fetch / readFileSync trong CODE (comment giải thích vì sao KHÔNG dùng thì được phép nhắc tên)', () => {
      const code = stripComments(SOURCE);
      expect(code).not.toMatch(/process\.env/);
      expect(code).not.toMatch(/\bfetch\(/);
      expect(code).not.toMatch(/readFileSync|writeFileSync/);
    });

    it('source KHÔNG parse GitHub ID bằng Number()/parseInt()/parseFloat()/BigInt()', () => {
      const code = stripComments(SOURCE);
      expect(code).not.toMatch(/\bNumber\(/);
      expect(code).not.toMatch(/\bparseInt\(/);
      expect(code).not.toMatch(/\bparseFloat\(/);
      expect(code).not.toMatch(/\bBigInt\(/);
    });
  });

  // ===============================================================================================
  // 28. Fake but internally consistent verified facts CAN pass — D2 chỉ mạnh bằng D4
  // ===============================================================================================
  describe('28. Documented limitation — D2 không tự xác minh Sigstore', () => {
    it('facts hoàn toàn TỰ BỊA (không qua verify Sigstore thật nào) nhưng NHẤT QUÁN với policy/evidence -> ok:true', () => {
      // Đây KHÔNG phải lỗ hổng của D2 — nó là ranh giới thiết kế đã ghi rõ trong header file:
      // giá trị an ninh của D2 phụ thuộc HOÀN TOÀN vào việc D4 chỉ dựng facts từ vật liệu ĐÃ VERIFY.
      const evidence = buildValidEvidence();
      const bogusFacts = buildValidFacts(evidence); // "bịa" theo nghĩa: không hề qua Sigstore thật,
      // nhưng test này CHỦ ĐỘNG dựng facts nhất quán để mô phỏng đúng tình huống "facts giả nhưng
      // tự nhất quán" — proving D2 cannot distinguish this from a real D4-verified facts object.
      const result = evaluateApprovalEvidencePolicy(
        buildValidContext({ evidence, facts: bogusFacts }),
      );
      expect(result.ok).toBe(true);
    });
  });
});
