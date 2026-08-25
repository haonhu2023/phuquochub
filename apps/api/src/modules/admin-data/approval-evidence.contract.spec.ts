import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SUPPORTED_EVIDENCE_VERSIONS,
  computeApprovalEvidenceDigest,
  serializeApprovalEvidence,
  validateApprovalEvidence,
  type ApprovalEvidencePayloadV1,
} from './approval-evidence.contract';

// -------------------------------------------------------------------------------------------
// Fixture — payload hợp lệ tối thiểu. `reason` mặc định có mặt; dùng
// `buildValidPayloadWithReasonDigest()` cho nhánh reasonDigest (XOR — không thể có cả hai qua
// spread thông thường vì `reason` phải bị XOÁ, không chỉ ghi đè).
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

/** Nhánh `reasonDigest` — XOÁ hẳn khoá `reason`, không chỉ ghi đè, để test đúng nhánh "chỉ digest". */
function buildValidPayloadWithReasonDigest(
  overrides: Partial<Omit<ApprovalEvidencePayloadV1, 'reason'>> = {},
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...buildValidPayload() };
  delete rest.reason;
  return { ...rest, reasonDigest: 'e'.repeat(64), ...overrides };
}

const SOURCE = readFileSync(join(__dirname, 'approval-evidence.contract.ts'), 'utf8');

// Loại bỏ comment khối và comment dòng trước khi quét CODE THẬT. File approval-evidence.contract.ts
// có nhiều JSDoc giải thích CHÍNH XÁC vì sao các mẫu như "gọi đồng hồ hệ thống" hay
// "attestedArtifactDigest" KHÔNG được dùng — quét cả văn bản (kể cả comment) sẽ tự báo
// false-positive với chính lời giải thích của nó (đúng lỗi đã gặp ở
// validate-publish-manifest.spec.ts cùng phiên làm việc này). Chỉ dùng cho hai test kiểm "không
// xuất hiện trong CODE" bên dưới; test đọc disclaimer (mục I, cuối file) CỐ Ý quét nguyên văn
// SOURCE vì đang kiểm chính nội dung comment đó.
function stripComments(source: string): string {
  const blockCommentPattern = new RegExp(['/', '\\*', '[\\s\\S]*?', '\\*', '/'].join(''), 'g');
  const lineCommentPattern = /\/\/.*$/gm;
  return source.replace(blockCommentPattern, '').replace(lineCommentPattern, '');
}

describe('approval-evidence.contract', () => {
  // ===========================================================================================
  // A. Valid contract
  // ===========================================================================================
  describe('A. Valid contract', () => {
    it('A1: fixture V1 hợp lệ → ok:true', () => {
      const result = validateApprovalEvidence(buildValidPayload());
      expect(result.ok).toBe(true);
    });

    it('A1b: fixture V1 hợp lệ với reasonDigest (thay vì reason) → ok:true', () => {
      const result = validateApprovalEvidence(buildValidPayloadWithReasonDigest());
      expect(result.ok).toBe(true);
    });

    it('A2: validator trả về CHÍNH object input (identity), không clone', () => {
      const payload = buildValidPayload();
      const result = validateApprovalEvidence(payload);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload).toBe(payload);
    });

    it('A2b: validator KHÔNG mutate input, dù hợp lệ hay không hợp lệ', () => {
      const valid = buildValidPayload();
      const validSnapshot = JSON.parse(JSON.stringify(valid));
      validateApprovalEvidence(valid);
      expect(valid).toEqual(validSnapshot);

      const invalid = { ...buildValidPayload(), evidenceVersion: 2 } as unknown;
      const invalidSnapshot = JSON.parse(JSON.stringify(invalid));
      validateApprovalEvidence(invalid);
      expect(invalid).toEqual(invalidSnapshot);
    });

    it('A3: numeric ID lớn hơn Number.MAX_SAFE_INTEGER vẫn HỢP LỆ dưới dạng chuỗi (không parse thành number)', () => {
      const huge = '99999999999999999999999999'; // vượt xa 2^53, không leading zero
      const result = validateApprovalEvidence(buildValidPayload({ repositoryId: huge }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.repositoryId).toBe(huge); // giữ nguyên chuỗi, không bị làm tròn
    });
  });

  // ===========================================================================================
  // B. Closed schema
  // ===========================================================================================
  describe('B. Closed schema', () => {
    it('B4: unknown top-level field → reject', () => {
      const bad = { ...buildValidPayload(), notAllowedField: 'x' } as unknown;
      const result = validateApprovalEvidence(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('notAllowedField'))).toBe(true);
    });

    it('B5: "unknown nested field" — payload PHẲNG có chủ đích (không object lồng nào trong schema), nên giá trị object lồng ở MỘT field vốn phải là scalar bị từ chối vì sai kiểu', () => {
      const bad = { ...buildValidPayload(), manifestId: { nested: 'x' } } as unknown;
      const result = validateApprovalEvidence(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('manifestId'))).toBe(true);
    });

    it('B5b: object lồng dưới một khoá top-level LẠ cũng bị chặn bởi unknown-key rejection', () => {
      const bad = { ...buildValidPayload(), extraNested: { a: { b: 'c' } } } as unknown;
      const result = validateApprovalEvidence(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('extraNested'))).toBe(true);
    });

    it('B6: __proto__ như khoá JSON THẬT (own property qua JSON.parse, không phải set-prototype của object literal) → bị từ chối vì là khoá lạ', () => {
      const raw = JSON.stringify(buildValidPayload());
      const withProto = raw.replace(/^\{/, '{"__proto__":{"polluted":true},');
      const parsed: unknown = JSON.parse(withProto);
      // Xác nhận đây thật sự là OWN property (không phải set prototype ngầm) trước khi assert validator.
      expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true);
      const result = validateApprovalEvidence(parsed);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('__proto__'))).toBe(true);
    });

    it('B6b: constructor/prototype như khoá lạ (own property qua object spread) → bị từ chối', () => {
      const withConstructor = { ...buildValidPayload(), constructor: 'polluted' } as unknown;
      const r1 = validateApprovalEvidence(withConstructor);
      expect(r1.ok).toBe(false);
      if (!r1.ok) expect(r1.errors.some((e) => e.includes('constructor'))).toBe(true);

      const withPrototype = { ...buildValidPayload(), prototype: 'polluted' } as unknown;
      const r2 = validateApprovalEvidence(withPrototype);
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.errors.some((e) => e.includes('prototype'))).toBe(true);
    });

    it('B7: secret/token/password/credential-like khoá lạ → bị từ chối (bắt bởi unknown-key rejection)', () => {
      for (const badKey of ['secret', 'apiToken', 'password', 'credential', 'githubToken']) {
        const bad = { ...buildValidPayload(), [badKey]: 'shhh' } as unknown;
        const result = validateApprovalEvidence(bad);
        expect(result.ok).toBe(false);
      }
    });

    it('B8: error message KHÔNG dump giá trị field nhạy cảm, chỉ tên khoá', () => {
      const marker = 'SUPER-SECRET-VALUE-DO-NOT-LEAK-12345';
      const bad = { ...buildValidPayload(), extraSecretKey: marker } as unknown;
      const result = validateApprovalEvidence(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const joined = result.errors.join('\n');
        expect(joined).not.toContain(marker);
        expect(joined).toContain('extraSecretKey'); // TÊN khoá được phép xuất hiện, GIÁ TRỊ thì không
      }
    });

    it('không có field digest tự tham chiếu nào lọt qua closed schema (attestedArtifactDigest/evidenceDigest/selfChecksum/evidenceChecksum)', () => {
      for (const key of [
        'attestedArtifactDigest',
        'evidenceDigest',
        'selfChecksum',
        'evidenceChecksum',
      ]) {
        const bad = { ...buildValidPayload(), [key]: 'x'.repeat(64) } as unknown;
        const result = validateApprovalEvidence(bad);
        expect(result.ok).toBe(false);
      }
    });
  });

  // ===========================================================================================
  // C. Version/types
  // ===========================================================================================
  describe('C. Version/types', () => {
    it('C9: evidenceVersion=2 → reject', () => {
      const result = validateApprovalEvidence({ ...buildValidPayload(), evidenceVersion: 2 });
      expect(result.ok).toBe(false);
    });

    it('C9b: SUPPORTED_EVIDENCE_VERSIONS chỉ có [1]', () => {
      expect(SUPPORTED_EVIDENCE_VERSIONS).toEqual([1]);
    });

    it('C10: payload primitive/null/array → reject', () => {
      for (const bad of [null, 42, 'string', true, undefined, [], [1, 2, 3]]) {
        const result = validateApprovalEvidence(bad);
        expect(result.ok).toBe(false);
      }
    });

    it('C11: thiếu từng required field (một tại một lần) → reject', () => {
      const requiredKeys: (keyof ApprovalEvidencePayloadV1)[] = [
        'evidenceVersion',
        'policyVersion',
        'manifestId',
        'manifestChecksum',
        'targetEnvironment',
        'repositoryId',
        'repositoryOwnerId',
        'commitSha',
        'workflowRef',
        'runId',
        'runAttempt',
        'environmentId',
        'reviewState',
        'approverProvider',
        'approverSubjectId',
        'reviewObservedAt',
        'reviewRecordDigest',
        'rawReviewResponseDigest',
        'issuer',
        'issuedAt',
        'notBefore',
        'notAfter',
        'repositoryFullName',
        'environmentName',
        'approverLogin',
      ];
      for (const key of requiredKeys) {
        const payload = buildValidPayload() as unknown as Record<string, unknown>;
        delete payload[key];
        const result = validateApprovalEvidence(payload);
        expect(result.ok).toBe(false);
      }
    });

    it('C11b: thiếu workflowSha (key vắng mặt, khác với giá trị null hợp lệ) → reject', () => {
      const payload = buildValidPayload() as unknown as Record<string, unknown>;
      delete payload.workflowSha;
      const result = validateApprovalEvidence(payload);
      expect(result.ok).toBe(false);
    });

    it('workflowSha = null (tường minh) → accept', () => {
      const result = validateApprovalEvidence(buildValidPayload({ workflowSha: null }));
      expect(result.ok).toBe(true);
    });

    it('C12: empty string ở các field string bắt buộc → reject', () => {
      for (const key of [
        'manifestId',
        'targetEnvironment',
        'workflowRef',
        'issuer',
        'environmentName',
        'approverLogin',
      ] as const) {
        const result = validateApprovalEvidence(buildValidPayload({ [key]: '' } as never));
        expect(result.ok).toBe(false);
      }
    });

    it('C12b: reason="" (chuỗi rỗng) → reject', () => {
      const result = validateApprovalEvidence(buildValidPayload({ reason: '' }));
      expect(result.ok).toBe(false);
    });
  });

  // ===========================================================================================
  // D. Numeric ID canonical form
  // ===========================================================================================
  describe('D. Numeric ID canonical form', () => {
    const ID_FIELDS = [
      'repositoryId',
      'repositoryOwnerId',
      'runId',
      'environmentId',
      'approverSubjectId',
    ] as const;

    it.each(['0', '01', '-1', '+1', '1.0', '1e3', ' 1', '1 ', '', 'abc'])(
      'ID field = "%s" → reject cho mọi field ID (repositoryId/repositoryOwnerId/runId/environmentId/approverSubjectId)',
      (bad) => {
        for (const field of ID_FIELDS) {
          const result = validateApprovalEvidence(buildValidPayload({ [field]: bad } as never));
          expect(result.ok).toBe(false);
        }
      },
    );

    it('ID field = number (không phải string) → reject', () => {
      for (const field of ID_FIELDS) {
        const result = validateApprovalEvidence(buildValidPayload({ [field]: 123 } as never));
        expect(result.ok).toBe(false);
      }
    });

    it('ID field = ký tự Unicode digit (vd Ả Rập-Ấn Độ ١٢٣, fullwidth １２３) → reject (regex chỉ ASCII)', () => {
      for (const bad of ['١٢٣', '１２３', '๑๒๓']) {
        for (const field of ID_FIELDS) {
          const result = validateApprovalEvidence(buildValidPayload({ [field]: bad } as never));
          expect(result.ok).toBe(false);
        }
      }
    });

    it('ID field = chuỗi thập phân dài hợp lệ (không leading zero) → accept', () => {
      for (const field of ID_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: '123456789012345678901234567890' } as never),
        );
        expect(result.ok).toBe(true);
      }
    });
  });

  // ===========================================================================================
  // E. Digests/SHA
  // ===========================================================================================
  describe('E. Digests/SHA', () => {
    const DIGEST_FIELDS = [
      'manifestChecksum',
      'reviewRecordDigest',
      'rawReviewResponseDigest',
    ] as const;

    it('64 lowercase hex → accept (đã chứng minh qua fixture hợp lệ ở mục A)', () => {
      expect(validateApprovalEvidence(buildValidPayload()).ok).toBe(true);
    });

    it('uppercase hex → reject', () => {
      for (const field of DIGEST_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: 'A'.repeat(64) } as never),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('63 hoặc 65 ký tự → reject', () => {
      for (const field of DIGEST_FIELDS) {
        expect(
          validateApprovalEvidence(buildValidPayload({ [field]: 'a'.repeat(63) } as never)).ok,
        ).toBe(false);
        expect(
          validateApprovalEvidence(buildValidPayload({ [field]: 'a'.repeat(65) } as never)).ok,
        ).toBe(false);
      }
    });

    it('ký tự non-hex → reject', () => {
      for (const field of DIGEST_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: 'g'.repeat(64) } as never),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('reasonDigest cũng phải đúng 64-hex thường khi được dùng', () => {
      expect(
        validateApprovalEvidence(
          buildValidPayloadWithReasonDigest({ reasonDigest: 'X'.repeat(64) }),
        ).ok,
      ).toBe(false);
      expect(
        validateApprovalEvidence(
          buildValidPayloadWithReasonDigest({ reasonDigest: 'e'.repeat(64) }),
        ).ok,
      ).toBe(true);
    });
  });

  // ===========================================================================================
  // F. Review boundary
  // ===========================================================================================
  describe('F. Review boundary', () => {
    it('reviewState khác "approved" → reject', () => {
      for (const bad of ['pending', 'rejected', 'APPROVED', '']) {
        const result = validateApprovalEvidence(buildValidPayload({ reviewState: bad as never }));
        expect(result.ok).toBe(false);
      }
    });

    it('approverProvider khác "github" → reject (V1 chỉ hỗ trợ github)', () => {
      for (const bad of ['gitlab', 'offline-key', 'GitHub', '']) {
        const result = validateApprovalEvidence(
          buildValidPayload({ approverProvider: bad as never }),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('approverLogin thay đổi KHÔNG ảnh hưởng kết quả validate (display-only, không phải identity authority)', () => {
      const a = validateApprovalEvidence(buildValidPayload({ approverLogin: 'alice' }));
      const b = validateApprovalEvidence(
        buildValidPayload({ approverLogin: 'completely-different-login' }),
      );
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      // approverSubjectId (authority thật) không đổi giữa hai payload trên; approverLogin đổi tự
      // do mà không tác động gì tới việc payload có hợp lệ hay không — đúng tính chất display-only.
    });

    it('approvedAt KHÔNG nằm trong danh sách khoá được chấp nhận (đổi tên có chủ đích — xem TIMESTAMP BOUNDARY)', () => {
      const withApprovedAt = {
        ...buildValidPayload(),
        approvedAt: '2026-08-25T10:00:00.000Z',
      } as unknown;
      const result = validateApprovalEvidence(withApprovedAt);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('approvedAt'))).toBe(true);
    });

    it('reviewObservedAt hợp lệ và cần thiết (đã chứng minh qua fixture hợp lệ)', () => {
      expect(validateApprovalEvidence(buildValidPayload()).ok).toBe(true);
    });

    it('doc comment TẠI field reviewObservedAt nói rõ đây là thời điểm QUAN SÁT, không phải lúc bấm Approve (quét hẹp quanh field, không quét toàn file)', () => {
      const anchor = SOURCE.indexOf('reviewObservedAt: string;');
      expect(anchor).toBeGreaterThan(-1);
      const fieldBlock = SOURCE.slice(Math.max(0, anchor - 400), anchor);
      expect(fieldBlock).toMatch(/QUAN SÁT/);
      expect(fieldBlock).toMatch(/KHÔNG phải lúc người dùng bấm Approve/);
    });
  });

  // ===========================================================================================
  // G. Timestamp
  // ===========================================================================================
  describe('G. Timestamp', () => {
    const TS_FIELDS = ['reviewObservedAt', 'issuedAt', 'notBefore', 'notAfter'] as const;

    it('canonical hợp lệ → accept (đã chứng minh qua fixture hợp lệ ở mục A)', () => {
      expect(validateApprovalEvidence(buildValidPayload()).ok).toBe(true);
    });

    it('thiếu mili-giây → reject cho mọi field timestamp', () => {
      for (const field of TS_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: '2026-08-25T10:00:00Z' } as never),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('offset +HH:MM thay vì Z → reject cho mọi field timestamp', () => {
      for (const field of TS_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: '2026-08-25T10:00:00.000+07:00' } as never),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('ngày rollover (2026-02-30) → reject cho mọi field timestamp', () => {
      for (const field of TS_FIELDS) {
        const result = validateApprovalEvidence(
          buildValidPayload({ [field]: '2026-02-30T00:00:00.000Z' } as never),
        );
        expect(result.ok).toBe(false);
      }
    });

    it('29/02 năm nhuận thật (2024) → accept', () => {
      const result = validateApprovalEvidence(
        buildValidPayload({
          reviewObservedAt: '2024-02-29T00:00:00.000Z',
          issuedAt: '2024-02-29T00:00:05.000Z',
          notBefore: '2024-02-29T00:00:00.000Z',
          notAfter: '2024-03-01T00:00:00.000Z',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('temporal ordering nội tại sai: notBefore MUỘN HƠN notAfter → reject (không phải wall-clock check)', () => {
      const result = validateApprovalEvidence(
        buildValidPayload({
          notBefore: '2026-08-26T10:00:00.000Z',
          notAfter: '2026-08-25T10:00:00.000Z',
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes('notBefore'))).toBe(true);
    });

    it('notBefore == notAfter (cửa sổ zero-width) → accept (không phải notBefore > notAfter)', () => {
      const result = validateApprovalEvidence(
        buildValidPayload({
          notBefore: '2026-08-25T10:00:00.000Z',
          notAfter: '2026-08-25T10:00:00.000Z',
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('source KHÔNG gọi Date.now() trong CODE (comment giải thích LÝ DO không gọi thì được phép) — validator không đọc đồng hồ hệ thống', () => {
      expect(stripComments(SOURCE)).not.toMatch(/Date\.now\(\)/);
    });
  });

  // ===========================================================================================
  // H. Serialization
  // ===========================================================================================
  describe('H. Serialization', () => {
    it('thứ tự khoá khác nhau → serialize ra CÙNG một chuỗi (canonicalJson sort khoá)', () => {
      const payloadA = buildValidPayload();
      const payloadB = Object.fromEntries(
        Object.entries(payloadA).reverse(),
      ) as unknown as ApprovalEvidencePayloadV1;
      expect(serializeApprovalEvidence(payloadA)).toBe(serializeApprovalEvidence(payloadB));
    });

    it('serialized output KHÔNG có BOM', () => {
      const serialized = serializeApprovalEvidence(buildValidPayload());
      expect(serialized.charCodeAt(0)).not.toBe(0xfeff);
      expect(serialized.startsWith('﻿')).toBe(false);
    });

    it('serialized output KHÔNG có newline cuối', () => {
      const serialized = serializeApprovalEvidence(buildValidPayload());
      expect(serialized.endsWith('\n')).toBe(false);
    });

    it('deterministic — gọi nhiều lần cho ra CÙNG bytes', () => {
      const payload = buildValidPayload();
      expect(serializeApprovalEvidence(payload)).toBe(serializeApprovalEvidence(payload));
      expect(computeApprovalEvidenceDigest(payload)).toBe(computeApprovalEvidenceDigest(payload));
    });

    it('giá trị thay đổi (dù một field) → digest thay đổi', () => {
      const a = buildValidPayload();
      const b = buildValidPayload({ manifestId: 'batch-2026-08-25-002' });
      expect(computeApprovalEvidenceDigest(a)).not.toBe(computeApprovalEvidenceDigest(b));
    });

    // "array order thay đổi → digest thay đổi" (Phase 8-H) KHÔNG áp dụng trực tiếp ở đây:
    // ApprovalEvidencePayloadV1 PHẲNG, không có field mảng nào (xem "KHÔNG CÓ WRAPPER TYPE" +
    // thiết kế phẳng trong approval-evidence.contract.ts). Tính chất "thứ tự mảng là dữ liệu,
    // không phải nhiễu" của canonicalJson() đã được canonical-json.spec.ts kiểm trực tiếp — không
    // lặp lại ở đây để tránh test trùng lặp vô nghĩa trên một hàm dùng chung.

    it('pretty-printed JSON của CÙNG nội dung cho ra digest KHÁC canonical bytes (exact-byte rule)', () => {
      const payload = buildValidPayload();
      const canonicalDigest = computeApprovalEvidenceDigest(payload);
      const prettyBytes = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      const prettyDigest = createHash('sha256').update(prettyBytes).digest('hex');
      expect(prettyDigest).not.toBe(canonicalDigest);
    });

    it('thêm MỘT newline vào cuối canonical bytes → digest KHÁC (không tự thêm/lược newline ở đâu đó)', () => {
      const payload = buildValidPayload();
      const canonicalDigest = computeApprovalEvidenceDigest(payload);
      const withTrailingNewline = createHash('sha256')
        .update(Buffer.from(`${serializeApprovalEvidence(payload)}\n`, 'utf8'))
        .digest('hex');
      expect(withTrailingNewline).not.toBe(canonicalDigest);
    });

    // Encoding tường minh (2026-08-25, Gate B): digest PHẢI khớp bit-for-bit với SHA-256 tính ĐỘC
    // LẬP trên `Buffer.from(serialized, 'utf8')` — KHÔNG dựa vào default encoding ngầm của
    // `Hash.update(string)`. Đây là semantic test (tính lại digest bằng tay từ một Buffer UTF-8
    // dựng riêng), KHÔNG phải source-text scan — theo đúng yêu cầu của owner: không dùng chuỗi
    // nguồn làm bằng chứng duy nhất cho tính đúng đắn của encoding.
    it('digest tính ĐỘC LẬP bằng crypto trên Buffer UTF-8 tường minh KHỚP CHÍNH XÁC với helper (Gate B)', () => {
      const payload = buildValidPayload();
      const serialized = serializeApprovalEvidence(payload);
      const independent = createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
      expect(computeApprovalEvidenceDigest(payload)).toBe(independent);
      expect(computeApprovalEvidenceDigest(payload)).toMatch(/^[0-9a-f]{64}$/); // 64 hex = SHA-256, thuật toán không đổi
    });

    it('payload chứa Unicode thật (dấu tiếng Việt, chữ Hàn, chữ Nga) → digest vẫn khớp SHA-256 tính độc lập trên Buffer UTF-8 (chứng minh xử lý đúng byte ngoài ASCII, không phải may mắn với ASCII-only)', () => {
      const payload = buildValidPayload({
        reason:
          'Phê duyệt sau khi rà soát thủ công — 한국어 텍스트 그리고 русский текст, đủ dấu: ă â ê ô ơ ư đ ẳ ẵ ệ ộ.',
      });
      const serialized = serializeApprovalEvidence(payload);
      const independent = createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
      expect(computeApprovalEvidenceDigest(payload)).toBe(independent);
    });

    it('thứ tự khoá khác nhau → digest (không chỉ chuỗi serialize) cũng ra CÙNG giá trị', () => {
      const payloadA = buildValidPayload();
      const payloadB = Object.fromEntries(
        Object.entries(payloadA).reverse(),
      ) as unknown as ApprovalEvidencePayloadV1;
      expect(computeApprovalEvidenceDigest(payloadA)).toBe(computeApprovalEvidenceDigest(payloadB));
    });

    it('payload hợp lệ KHÔNG chứa digest của chính nó (không field nào trong ALLOWED_KEYS là self-reference)', () => {
      const payload = buildValidPayload();
      const serialized = serializeApprovalEvidence(payload);
      expect(serialized).not.toContain('attestedArtifactDigest');
      expect(serialized).not.toContain('evidenceDigest');
    });

    it('source KHÔNG khai báo field attestedArtifactDigest/evidenceChecksum/selfChecksum trong CODE (comment giải thích vì sao KHÔNG có field đó thì được phép nhắc tên nó)', () => {
      const code = stripComments(SOURCE);
      expect(code).not.toMatch(/attestedArtifactDigest/);
      expect(code).not.toMatch(/evidenceChecksum/);
      expect(code).not.toMatch(/selfChecksum/);
    });
  });

  // ===========================================================================================
  // I. Architecture
  // ===========================================================================================
  describe('I. Architecture', () => {
    function extractImportStatements(source: string): string[] {
      return source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('import '));
    }

    it('source CHỈ import node:crypto + common canonical utilities — đúng 3 dòng, không hơn', () => {
      const importLines = extractImportStatements(SOURCE);
      expect(importLines).toHaveLength(3);
      expect(importLines).toEqual([
        "import { createHash } from 'crypto';",
        "import { canonicalJson } from '../../common/canonical-json';",
        "import { isValidCanonicalTimestamp } from '../../common/canonical-timestamp';",
      ]);
    });

    it('không có import nào tới @nestjs/*, typeorm, ../app.module, data-source, hay bất kỳ *.service.ts (hệ quả trực tiếp của "đúng 3 dòng" ở trên, kiểm lại tường minh theo từng mục cấm)', () => {
      const importLines = extractImportStatements(SOURCE).join('\n');
      for (const pattern of [
        /from ['"]\.\.\/app\.module['"]/,
        /from ['"]@nestjs\//,
        /from ['"]typeorm['"]/,
        /data-source/i,
        /from ['"].*\.service['"]/i,
        /from ['"]fs['"]/,
        /from ['"]http['"]/,
        /from ['"]https['"]/,
        /from ['"]axios['"]/,
        /from ['"]@aws-sdk/,
      ]) {
        expect(importLines).not.toMatch(pattern);
      }
    });

    it('source KHÔNG dùng process.env', () => {
      expect(SOURCE).not.toMatch(/process\.env/);
    });

    it('source KHÔNG gọi fetch()/require("fs")/bất kỳ I/O nào', () => {
      expect(SOURCE).not.toMatch(/\bfetch\(/);
      expect(SOURCE).not.toMatch(/require\(['"]fs['"]\)/);
      expect(SOURCE).not.toMatch(/readFileSync|writeFileSync/);
    });

    it('doc comment đầu file nói rõ D1 KHÔNG phải authentication, và nêu ranh giới D2/D3/D4', () => {
      const header = SOURCE.slice(0, 6000);
      expect(header).toMatch(/KHÔNG nghĩa là đã được xác thực|D1 KHÔNG:/);
      expect(header).toMatch(/D2/);
      expect(header).toMatch(/0\.5D3|D3\b/);
      expect(header).toMatch(/0\.5D4|D4\b/);
    });
  });
});
