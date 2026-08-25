import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NORMALIZED_REVIEW_RECORD_ALLOWED_KEYS,
  buildNormalizedReviewRecord,
  computeReviewRecordDigest,
  serializeNormalizedReviewRecord,
  type NormalizedReviewRecordV1,
} from './approval-review-record.contract';
import type { ApprovalEvidencePayloadV1 } from './approval-evidence.contract';

// -------------------------------------------------------------------------------------------
// Fixture — cùng shape với buildValidPayload() ở approval-evidence.contract.spec.ts (không import
// chéo giữa hai spec file — mỗi spec tự đứng độc lập, cùng quy ước fixture-per-file của repo).
// -------------------------------------------------------------------------------------------
function buildValidPayload(
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
    reviewRecordDigest: 'c'.repeat(64),
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

function buildValidPayloadWithReasonDigest(
  overrides: Partial<Omit<ApprovalEvidencePayloadV1, 'reason'>> = {},
): ApprovalEvidencePayloadV1 {
  const rest: Record<string, unknown> = { ...buildValidPayload() };
  delete rest.reason;
  return { ...rest, reasonDigest: 'e'.repeat(64), ...overrides } as ApprovalEvidencePayloadV1;
}

const SOURCE = readFileSync(join(__dirname, 'approval-review-record.contract.ts'), 'utf8');

function stripComments(source: string): string {
  const blockCommentPattern = new RegExp(['/', '\\*', '[\\s\\S]*?', '\\*', '/'].join(''), 'g');
  const lineCommentPattern = /\/\/.*$/gm;
  return source.replace(blockCommentPattern, '').replace(lineCommentPattern, '');
}

describe('approval-review-record.contract', () => {
  // =============================================================================================
  // Mapping evidence -> normalized review record
  // =============================================================================================
  describe('buildNormalizedReviewRecord — mapping', () => {
    it('reason (có mặt) -> comment; reasonDigest KHÔNG xuất hiện', () => {
      const payload = buildValidPayload({ reason: 'Approved after manual review.' });
      const record = buildNormalizedReviewRecord(payload);
      expect(record.comment).toBe('Approved after manual review.');
      expect(Object.prototype.hasOwnProperty.call(record, 'commentDigest')).toBe(false);
    });

    it('reasonDigest (có mặt, reason vắng) -> commentDigest; comment KHÔNG xuất hiện', () => {
      const payload = buildValidPayloadWithReasonDigest({ reasonDigest: 'f'.repeat(64) });
      const record = buildNormalizedReviewRecord(payload);
      expect(record.commentDigest).toBe('f'.repeat(64));
      expect(Object.prototype.hasOwnProperty.call(record, 'comment')).toBe(false);
    });

    it('environmentId/state/approverSubjectId được copy đúng từ payload', () => {
      const payload = buildValidPayload({
        environmentId: '555666777',
        approverSubjectId: '999888777',
      });
      const record = buildNormalizedReviewRecord(payload);
      expect(record.environmentId).toBe('555666777');
      expect(record.state).toBe('approved');
      expect(record.approverSubjectId).toBe('999888777');
    });

    it('record KHÔNG chứa approverLogin/environmentName/bất kỳ field nào khác ngoài 5 khoá cho phép', () => {
      const payload = buildValidPayload({
        approverLogin: 'someone-visible-only',
        environmentName: 'production-data',
      });
      const record = buildNormalizedReviewRecord(payload) as unknown as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        expect(NORMALIZED_REVIEW_RECORD_ALLOWED_KEYS.has(key)).toBe(true);
      }
      expect(Object.prototype.hasOwnProperty.call(record, 'approverLogin')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(record, 'environmentName')).toBe(false);
    });

    it('không mutate payload input', () => {
      const payload = buildValidPayload();
      const snapshot = JSON.parse(JSON.stringify(payload));
      buildNormalizedReviewRecord(payload);
      expect(payload).toEqual(snapshot);
    });
  });

  // =============================================================================================
  // Serialization
  // =============================================================================================
  describe('serializeNormalizedReviewRecord', () => {
    it('thứ tự khoá khác nhau -> serialize ra CÙNG một chuỗi (canonicalJson sort khoá)', () => {
      const recordA: NormalizedReviewRecordV1 = {
        environmentId: '1',
        state: 'approved',
        approverSubjectId: '2',
        comment: 'x',
      };
      const recordB = Object.fromEntries(
        Object.entries(recordA).reverse(),
      ) as unknown as NormalizedReviewRecordV1;
      expect(serializeNormalizedReviewRecord(recordA)).toBe(serializeNormalizedReviewRecord(recordB));
    });

    it('serialized output KHÔNG có BOM và KHÔNG có newline cuối', () => {
      const record = buildNormalizedReviewRecord(buildValidPayload());
      const serialized = serializeNormalizedReviewRecord(record);
      expect(serialized.charCodeAt(0)).not.toBe(0xfeff);
      expect(serialized.endsWith('\n')).toBe(false);
    });

    it('record KHÔNG chứa digest của chính nó (không self-reference)', () => {
      const record = buildNormalizedReviewRecord(buildValidPayload());
      const serialized = serializeNormalizedReviewRecord(record);
      expect(serialized).not.toContain('reviewRecordDigest');
      expect(serialized).not.toContain('digest');
    });
  });

  // =============================================================================================
  // Digest — explicit UTF-8 Buffer, semantic test (không dùng source-text scan làm bằng chứng)
  // =============================================================================================
  describe('computeReviewRecordDigest', () => {
    it('digest tính ĐỘC LẬP bằng crypto trên Buffer UTF-8 tường minh KHỚP CHÍNH XÁC với helper', () => {
      const record = buildNormalizedReviewRecord(buildValidPayload());
      const serialized = serializeNormalizedReviewRecord(record);
      const independent = createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
      expect(computeReviewRecordDigest(record)).toBe(independent);
      expect(computeReviewRecordDigest(record)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('payload chứa Unicode thật (dấu tiếng Việt, chữ Hàn, chữ Nga) trong comment -> digest vẫn khớp SHA-256 độc lập trên Buffer UTF-8', () => {
      const payload = buildValidPayload({
        reason: 'Phê duyệt — 한국어 텍스트 그리고 русский текст, đủ dấu: ă â ê ô ơ ư đ.',
      });
      const record = buildNormalizedReviewRecord(payload);
      const serialized = serializeNormalizedReviewRecord(record);
      const independent = createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
      expect(computeReviewRecordDigest(record)).toBe(independent);
    });

    it('deterministic — gọi nhiều lần cho ra CÙNG digest', () => {
      const record = buildNormalizedReviewRecord(buildValidPayload());
      expect(computeReviewRecordDigest(record)).toBe(computeReviewRecordDigest(record));
    });

    it('giá trị approverSubjectId khác nhau -> digest khác nhau (bắt được payload tự mâu thuẫn)', () => {
      const recordA = buildNormalizedReviewRecord(buildValidPayload({ approverSubjectId: '111' }));
      const recordB = buildNormalizedReviewRecord(buildValidPayload({ approverSubjectId: '222' }));
      expect(computeReviewRecordDigest(recordA)).not.toBe(computeReviewRecordDigest(recordB));
    });

    it('comment khác reasonDigest tương ứng -> digest khác nhau giữa hai nhánh', () => {
      const withComment = buildNormalizedReviewRecord(buildValidPayload({ reason: 'A' }));
      const withDigest = buildNormalizedReviewRecord(
        buildValidPayloadWithReasonDigest({ reasonDigest: 'a'.repeat(64) }),
      );
      expect(computeReviewRecordDigest(withComment)).not.toBe(computeReviewRecordDigest(withDigest));
    });
  });

  // =============================================================================================
  // Architecture — thuần, không I/O
  // =============================================================================================
  describe('Architecture', () => {
    function extractImportStatements(source: string): string[] {
      return source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('import '));
    }

    it('source CHỈ import node:crypto + common canonical-json + type từ approval-evidence.contract — đúng 3 dòng', () => {
      const importLines = extractImportStatements(SOURCE);
      expect(importLines).toHaveLength(3);
      expect(importLines).toEqual([
        "import { createHash } from 'crypto';",
        "import { canonicalJson } from '../../common/canonical-json';",
        "import type { ApprovalEvidencePayloadV1 } from './approval-evidence.contract';",
      ]);
    });

    it('không có import nào tới @nestjs/*, typeorm, fs, http, network, DB', () => {
      const importLines = extractImportStatements(SOURCE).join('\n');
      for (const pattern of [
        /from ['"]@nestjs\//,
        /from ['"]typeorm['"]/,
        /from ['"]fs['"]/,
        /from ['"]http['"]/,
        /from ['"]https['"]/,
        /from ['"]axios['"]/,
      ]) {
        expect(importLines).not.toMatch(pattern);
      }
    });

    it('source KHÔNG dùng process.env, Date.now(), hay bất kỳ I/O nào', () => {
      expect(SOURCE).not.toMatch(/process\.env/);
      expect(stripComments(SOURCE)).not.toMatch(/Date\.now\(\)/);
      expect(SOURCE).not.toMatch(/\bfetch\(/);
      expect(SOURCE).not.toMatch(/readFileSync|writeFileSync/);
    });

    it('doc comment đầu file ghi rõ digest chỉ chứng minh A<->A consistency, không phải authenticity', () => {
      const header = SOURCE.slice(0, 3000);
      expect(header).toMatch(/INTERNAL CONSISTENCY|A↔A/);
      expect(header).toMatch(/KHÔNG chứng minh/);
    });
  });
});
