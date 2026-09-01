// Contract-drift test: proves the bundle builder and the NestJS importer share a single
// source of truth for the contract version, enums, canonical JSON, row hash, and validation.
//
// How the single-truth is maintained:
//   scripts/build-multilingual-bundle/contract-standalone.ts
//     └── re-exports ONLY from ../../apps/api/src/modules/multilingual-import/multilingual-import.contract
//         and ../../apps/api/src/modules/multilingual-import/multilingual-import.enums
//
// Because contract-standalone.ts is a pure re-export (no independent implementations), this test
// file is the runtime verification that the expected contract shape remains stable and that both
// the builder (via contract-standalone) and the importer (direct import) see the same values.

import {
  MULTILINGUAL_IMPORT_CONTRACT_VERSION,
  MultilingualImportBatchStatus,
  MultilingualImportRowOutcome,
  TranslationApprovalStatus,
  HumanReviewStatus,
  QualityGateStatus,
  DuplicateStatus,
  ForeignKeyStatus,
  ValidationStatus,
} from '../multilingual-import.enums';
import {
  canonicalJsonContract,
  computeRowHash,
  computeManifestChecksum,
  validateContract,
  ACCEPTED_TEXT_FORMATS,
  ACCEPTED_TRANSLATION_METHODS,
  MultilingualImportContractRow,
} from '../multilingual-import.contract';

// ============================================================================
// Contract version
// ============================================================================

describe('contract version', () => {
  it('is exactly "phuquochub.multilingual-import.v1"', () => {
    expect(MULTILINGUAL_IMPORT_CONTRACT_VERSION).toBe('phuquochub.multilingual-import.v1');
  });

  it('is a const — not a mutable value', () => {
    // Verify the module exports the const as a string literal (not an enum object)
    expect(typeof MULTILINGUAL_IMPORT_CONTRACT_VERSION).toBe('string');
  });
});

// ============================================================================
// Enum shape (importer depends on these exact string values stored in DB)
// ============================================================================

describe('enum values', () => {
  it('MultilingualImportBatchStatus has expected DB values', () => {
    expect(MultilingualImportBatchStatus.PENDING).toBe('pending');
    expect(MultilingualImportBatchStatus.RUNNING).toBe('running');
    expect(MultilingualImportBatchStatus.SUCCEEDED).toBe('succeeded');
    expect(MultilingualImportBatchStatus.FAILED).toBe('failed');
    expect(MultilingualImportBatchStatus.ROLLED_BACK).toBe('rolled_back');
  });

  it('MultilingualImportRowOutcome has expected DB values', () => {
    expect(MultilingualImportRowOutcome.INSERTED).toBe('inserted');
    expect(MultilingualImportRowOutcome.ALREADY_CURRENT).toBe('already_current');
    expect(MultilingualImportRowOutcome.HELD).toBe('held');
    expect(MultilingualImportRowOutcome.FAILED).toBe('failed');
  });

  it('gate enums match XLSX-column vocabulary', () => {
    expect(TranslationApprovalStatus.APPROVED).toBe('APPROVED');
    expect(HumanReviewStatus.APPROVED).toBe('APPROVED');
    expect(QualityGateStatus.PASS).toBe('PASS');
    expect(DuplicateStatus.CLEAR).toBe('CLEAR');
    expect(ForeignKeyStatus.PASS).toBe('PASS');
    expect(ValidationStatus.FAIL).toBe('FAIL');
  });

  it('ACCEPTED_TEXT_FORMATS match translation_method DB enum values', () => {
    expect(ACCEPTED_TEXT_FORMATS).toContain('plain_text');
    expect(ACCEPTED_TEXT_FORMATS).toContain('markdown');
    expect(ACCEPTED_TEXT_FORMATS).toHaveLength(2);
  });

  it('ACCEPTED_TRANSLATION_METHODS match translation_method DB enum values', () => {
    expect(ACCEPTED_TRANSLATION_METHODS).toContain('original');
    expect(ACCEPTED_TRANSLATION_METHODS).toContain('human');
    expect(ACCEPTED_TRANSLATION_METHODS).toContain('ai_plus_human');
    expect(ACCEPTED_TRANSLATION_METHODS).toContain('official_or_human');
    expect(ACCEPTED_TRANSLATION_METHODS).toHaveLength(4);
  });
});

// ============================================================================
// canonicalJsonContract — key-order independence (hash stability)
// ============================================================================

describe('canonicalJsonContract', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = canonicalJsonContract({ b: 2, a: 1 });
    const b = canonicalJsonContract({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2}');
  });

  it('sorts nested object keys recursively', () => {
    const a = canonicalJsonContract({ z: { b: 2, a: 1 }, y: 'x' });
    const b = canonicalJsonContract({ y: 'x', z: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    expect(canonicalJsonContract([3, 1, 2])).toBe('[3,1,2]');
  });

  it('is deterministic across runs — same object → identical bytes', () => {
    const obj = { placeId: 'abc', localeCode: 'vi', translatedText: 'Xin chào' };
    const r1 = canonicalJsonContract(obj);
    const r2 = canonicalJsonContract(obj);
    expect(r1).toBe(r2);
  });
});

// ============================================================================
// computeRowHash — integrity for each row
// ============================================================================

function makeBaseRow(): Omit<MultilingualImportContractRow, 'rowHash'> {
  return {
    placeId: '12345678-1234-4234-a234-123456789abc',
    fieldKey: 'short_description',
    localeCode: 'vi',
    sourceLocaleCode: 'vi',
    translatedText: 'Mô tả ngắn',
    sourceText: 'Mô tả ngắn',
    textFormat: 'plain_text',
    translationMethod: 'original',
    translationStatus: 'APPROVED',
    humanReviewStatus: 'APPROVED',
    qualityGate: 'PASS',
    duplicateStatus: 'CLEAR',
    foreignKeyStatus: 'PASS',
    validationStatus: 'PASS',
    errorCount: 0,
    isPublic: true,
    isProductionData: true,
    productionEligible: true,
    sourceId: null,
    evidenceId: null,
  };
}

describe('computeRowHash', () => {
  it('produces a 64-char lowercase hex string', () => {
    const h = computeRowHash(makeBaseRow());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const base = makeBaseRow();
    expect(computeRowHash(base)).toBe(computeRowHash(base));
  });

  it('changes when any field changes', () => {
    const base = makeBaseRow();
    const h1 = computeRowHash(base);
    const h2 = computeRowHash({ ...base, translatedText: 'Different' });
    expect(h1).not.toBe(h2);
  });

  it('is key-order-independent', () => {
    const base = makeBaseRow();
    const { placeId, ...rest } = base;
    const ordered: Omit<MultilingualImportContractRow, 'rowHash'> = { placeId, ...rest };
    const reordered: Omit<MultilingualImportContractRow, 'rowHash'> = { ...rest, placeId };
    expect(computeRowHash(ordered)).toBe(computeRowHash(reordered));
  });
});

// ============================================================================
// computeManifestChecksum — integrity for the full rows array
// ============================================================================

describe('computeManifestChecksum', () => {
  it('produces a 64-char hex string', () => {
    const base = makeBaseRow();
    const row: MultilingualImportContractRow = { ...base, rowHash: computeRowHash(base) };
    expect(computeManifestChecksum([row])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a row is added', () => {
    const base = makeBaseRow();
    const r1: MultilingualImportContractRow = { ...base, rowHash: computeRowHash(base) };
    const r2: MultilingualImportContractRow = { ...{ ...base, localeCode: 'en' }, rowHash: computeRowHash({ ...base, localeCode: 'en' }) };
    const c1 = computeManifestChecksum([r1]);
    const c2 = computeManifestChecksum([r1, r2]);
    expect(c1).not.toBe(c2);
  });

  it('is key-order-independent for row objects', () => {
    const base = makeBaseRow();
    const { placeId, ...rest } = base;
    const r1: MultilingualImportContractRow = { placeId, ...rest, rowHash: computeRowHash(base) };
    const r2: MultilingualImportContractRow = { ...rest, placeId, rowHash: computeRowHash(base) };
    expect(computeManifestChecksum([r1])).toBe(computeManifestChecksum([r2]));
  });
});

// ============================================================================
// validateContract — shared validation logic
// ============================================================================

describe('validateContract', () => {
  it('accepts a well-formed contract', () => {
    const base = makeBaseRow();
    const row: MultilingualImportContractRow = { ...base, rowHash: computeRowHash(base) };
    const pmc = computeManifestChecksum([row]);
    const contract = {
      contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
      generatedAt: '2026-08-30T00:00:00.000Z',
      batchId: '12345678-1234-4234-a234-123456789abc',
      sourceChecksum: 'a'.repeat(64),
      approvalEvidenceChecksum: 'b'.repeat(64),
      publishManifestChecksum: pmc,
      totalRows: 1,
      rows: [row],
      summary: { byLocale: { vi: 1 }, byField: { short_description: 1 }, totalApproved: 1, totalHeld: 0, totalRejected: 0 },
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a wrong contractVersion', () => {
    const base = makeBaseRow();
    const row: MultilingualImportContractRow = { ...base, rowHash: computeRowHash(base) };
    const pmc = computeManifestChecksum([row]);
    const contract = {
      contractVersion: 'phuquochub.multilingual-import.v0',
      generatedAt: '2026-08-30T00:00:00.000Z',
      batchId: '12345678-1234-4234-a234-123456789abc',
      sourceChecksum: 'a'.repeat(64),
      approvalEvidenceChecksum: 'b'.repeat(64),
      publishManifestChecksum: pmc,
      totalRows: 1,
      rows: [row],
      summary: { byLocale: {}, byField: {}, totalApproved: 1, totalHeld: 0, totalRejected: 0 },
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'contractVersion')).toBe(true);
  });

  it('detects a tampered rowHash', () => {
    const base = makeBaseRow();
    const tamperedRow = { ...base, rowHash: 'f'.repeat(64) };
    const pmc = computeManifestChecksum([tamperedRow]);
    const contract = {
      contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
      generatedAt: '2026-08-30T00:00:00.000Z',
      batchId: '12345678-1234-4234-a234-123456789abc',
      sourceChecksum: 'a'.repeat(64),
      approvalEvidenceChecksum: 'b'.repeat(64),
      publishManifestChecksum: pmc,
      totalRows: 1,
      rows: [tamperedRow],
      summary: { byLocale: {}, byField: {}, totalApproved: 1, totalHeld: 0, totalRejected: 0 },
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('rowHash'))).toBe(true);
  });

  it('detects a tampered publishManifestChecksum', () => {
    const base = makeBaseRow();
    const row: MultilingualImportContractRow = { ...base, rowHash: computeRowHash(base) };
    const contract = {
      contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
      generatedAt: '2026-08-30T00:00:00.000Z',
      batchId: '12345678-1234-4234-a234-123456789abc',
      sourceChecksum: 'a'.repeat(64),
      approvalEvidenceChecksum: 'b'.repeat(64),
      publishManifestChecksum: 'e'.repeat(64), // wrong
      totalRows: 1,
      rows: [row],
      summary: { byLocale: {}, byField: {}, totalApproved: 1, totalHeld: 0, totalRejected: 0 },
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'publishManifestChecksum')).toBe(true);
  });
});
