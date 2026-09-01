import { createHash } from 'crypto';
import {
  validateContract,
  computeRowHash,
  computeManifestChecksum,
  canonicalJsonContract,
  MultilingualImportContractRow,
  MultilingualImportContract,
} from '../multilingual-import.contract';
import { MULTILINGUAL_IMPORT_CONTRACT_VERSION } from '../multilingual-import.enums';

// ============================================================================
// Helpers
// ============================================================================

function sha256hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

const VALID_UUID = '12345678-1234-4234-a234-123456789abc';
const VALID_UUID_2 = '87654321-4321-4321-b321-cba987654321';

function makeValidRow(overrides: Partial<Omit<MultilingualImportContractRow, 'rowHash'>> = {}): MultilingualImportContractRow {
  const base: Omit<MultilingualImportContractRow, 'rowHash'> = {
    placeId: VALID_UUID,
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
    ...overrides,
  };
  return { ...base, rowHash: computeRowHash(base) };
}

function makeValidContract(rowOverrides: Partial<Omit<MultilingualImportContractRow, 'rowHash'>>[] = [{}]): MultilingualImportContract {
  const rows = rowOverrides.map(o => makeValidRow(o));
  const publishManifestChecksum = computeManifestChecksum(rows);
  return {
    contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
    generatedAt: '2026-08-30T00:00:00.000Z',
    batchId: VALID_UUID,
    sourceChecksum: sha256hex('source'),
    approvalEvidenceChecksum: sha256hex('evidence'),
    publishManifestChecksum,
    totalRows: rows.length,
    rows,
    summary: { byLocale: { vi: rows.length }, byField: { short_description: rows.length }, totalApproved: rows.length, totalHeld: 0, totalRejected: 0 },
  };
}

// ============================================================================
// Contract version
// ============================================================================

describe('validateContract — contractVersion', () => {
  it('accepts the correct contract version', () => {
    const result = validateContract(makeValidContract());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a wrong contract version', () => {
    const c = makeValidContract();
    const r = validateContract({ ...c, contractVersion: 'phuquochub.multilingual-import.v0' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'contractVersion')).toBe(true);
  });

  it('rejects a missing contractVersion', () => {
    const c = makeValidContract();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { contractVersion: _v, ...rest } = c;
    const r = validateContract(rest);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'contractVersion')).toBe(true);
  });
});

// ============================================================================
// Top-level field validation
// ============================================================================

describe('validateContract — top-level fields', () => {
  it('rejects non-object input', () => {
    expect(validateContract('string').valid).toBe(false);
    expect(validateContract(null).valid).toBe(false);
    expect(validateContract(42).valid).toBe(false);
  });

  it('rejects invalid batchId', () => {
    const r = validateContract({ ...makeValidContract(), batchId: 'not-a-uuid' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'batchId')).toBe(true);
  });

  it('rejects missing generatedAt', () => {
    const c = makeValidContract() as unknown as Record<string, unknown>;
    delete c['generatedAt'];
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'generatedAt')).toBe(true);
  });

  it('rejects bad sourceChecksum (not 64-char hex)', () => {
    const r = validateContract({ ...makeValidContract(), sourceChecksum: 'tooshort' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'sourceChecksum')).toBe(true);
  });

  it('rejects bad publishManifestChecksum', () => {
    const r = validateContract({ ...makeValidContract(), publishManifestChecksum: 'bad' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'publishManifestChecksum')).toBe(true);
  });

  it('rejects empty rows array', () => {
    const c = { ...makeValidContract(), rows: [], totalRows: 0 };
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'rows')).toBe(true);
  });

  it('rejects totalRows mismatch', () => {
    const c = makeValidContract();
    const r = validateContract({ ...c, totalRows: 999 });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'totalRows')).toBe(true);
  });
});

// ============================================================================
// Row-level field validation
// ============================================================================

describe('validateContract — row fields', () => {
  it('rejects missing placeId', () => {
    const row = makeValidRow();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { placeId: _p, ...rest } = row;
    const c = { ...makeValidContract(), rows: [{ ...rest }], totalRows: 1 };
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('placeId'))).toBe(true);
  });

  it('rejects placeId that is not a UUID', () => {
    const r = validateContract(makeValidContract([{ placeId: 'not-a-uuid' }]));
    expect(r.valid).toBe(false);
  });

  it('rejects empty fieldKey', () => {
    const r = validateContract(makeValidContract([{ fieldKey: '' }]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('fieldKey'))).toBe(true);
  });

  it('rejects fieldKey longer than 60 chars', () => {
    const r = validateContract(makeValidContract([{ fieldKey: 'a'.repeat(61) }]));
    expect(r.valid).toBe(false);
  });

  it('rejects invalid textFormat', () => {
    const r = validateContract(makeValidContract([{ textFormat: 'html' as unknown as 'plain_text' }]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('textFormat'))).toBe(true);
  });

  it('rejects invalid translationMethod', () => {
    const r = validateContract(makeValidContract([{ translationMethod: 'google_translate' as unknown as 'original' }]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('translationMethod'))).toBe(true);
  });

  it('rejects errorCount that is not a non-negative integer', () => {
    const r1 = validateContract(makeValidContract([{ errorCount: -1 }]));
    expect(r1.valid).toBe(false);
    const r2 = validateContract(makeValidContract([{ errorCount: 1.5 as unknown as number }]));
    expect(r2.valid).toBe(false);
  });

  it('rejects non-boolean isPublic', () => {
    const r = validateContract(makeValidContract([{ isPublic: 'true' as unknown as boolean }]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('isPublic'))).toBe(true);
  });

  it('rejects sourceId that is not null or UUID', () => {
    const r = validateContract(makeValidContract([{ sourceId: 'bad-id' }]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('sourceId'))).toBe(true);
  });

  it('accepts sourceId=null and evidenceId=null', () => {
    const r = validateContract(makeValidContract([{ sourceId: null, evidenceId: null }]));
    expect(r.valid).toBe(true);
  });

  it('accepts sourceId as a UUID', () => {
    const r = validateContract(makeValidContract([{ sourceId: VALID_UUID_2 }]));
    expect(r.valid).toBe(true);
  });
});

// ============================================================================
// rowHash integrity
// ============================================================================

describe('validateContract — rowHash integrity', () => {
  it('rejects a row with a tampered rowHash', () => {
    const row = makeValidRow();
    const tampered = { ...row, rowHash: 'a'.repeat(64) };
    const rows = [tampered];
    const pmc = computeManifestChecksum(rows as MultilingualImportContractRow[]);
    const c = { ...makeValidContract(), rows, totalRows: 1, publishManifestChecksum: pmc };
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('rowHash'))).toBe(true);
  });

  it('rejects a row whose hash does not match its content (content mutated after hash computed)', () => {
    const row = makeValidRow();
    // Mutate content but keep old hash
    const mutated = { ...row, translatedText: 'Different text' };
    const rows = [mutated];
    const pmc = computeManifestChecksum(rows as MultilingualImportContractRow[]);
    const c = { ...makeValidContract(), rows, totalRows: 1, publishManifestChecksum: pmc };
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field.includes('rowHash'))).toBe(true);
  });
});

// ============================================================================
// publishManifestChecksum integrity
// ============================================================================

describe('validateContract — publishManifestChecksum', () => {
  it('rejects a tampered publishManifestChecksum', () => {
    const c = makeValidContract();
    const r = validateContract({ ...c, publishManifestChecksum: 'b'.repeat(64) });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'publishManifestChecksum')).toBe(true);
  });

  it('detects bundle tampering when a row is modified after checksum computed', () => {
    const c = makeValidContract();
    // Tamper a row but keep the old checksum
    const tamperedRow = { ...c.rows[0], translatedText: 'Attacked!' };
    // Re-hash the row so it passes individual rowHash check
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowHash: _rh, ...rest } = tamperedRow;
    const fixedRow = { ...rest, rowHash: computeRowHash(rest) };
    const r = validateContract({ ...c, rows: [fixedRow], totalRows: 1 });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.field === 'publishManifestChecksum')).toBe(true);
  });
});

// ============================================================================
// canonicalJsonContract determinism
// ============================================================================

describe('canonicalJsonContract', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = canonicalJsonContract({ b: 2, a: 1 });
    const b = canonicalJsonContract({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('sorts nested object keys too', () => {
    const a = canonicalJsonContract({ z: { b: 2, a: 1 } });
    const b = canonicalJsonContract({ z: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    const a = canonicalJsonContract([3, 1, 2]);
    expect(a).toBe('[3,1,2]');
  });
});

// ============================================================================
// computeRowHash determinism
// ============================================================================

describe('computeRowHash', () => {
  it('is deterministic: same input → same hash', () => {
    const row = makeValidRow();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowHash: _rh, ...rest } = row;
    const h1 = computeRowHash(rest);
    const h2 = computeRowHash(rest);
    expect(h1).toBe(h2);
  });

  it('changes when any field changes', () => {
    const row = makeValidRow();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowHash: _rh, ...rest } = row;
    const h1 = computeRowHash(rest);
    const h2 = computeRowHash({ ...rest, translatedText: 'Changed' });
    expect(h1).not.toBe(h2);
  });

  it('is key-order-independent', () => {
    const row = makeValidRow();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rowHash: _rh, placeId, ...restWithoutPlace } = row;
    const ordered = { placeId, ...restWithoutPlace } as unknown as Omit<MultilingualImportContractRow, 'rowHash'>;
    const reordered = { ...restWithoutPlace, placeId } as unknown as Omit<MultilingualImportContractRow, 'rowHash'>;
    expect(computeRowHash(ordered)).toBe(computeRowHash(reordered));
  });
});

// ============================================================================
// Multiple rows + summary
// ============================================================================

describe('validateContract — multiple rows', () => {
  it('accepts a contract with vi and en rows', () => {
    const r = validateContract(
      makeValidContract([
        { localeCode: 'vi', translationMethod: 'original' },
        { localeCode: 'en', translationMethod: 'human' },
      ]),
    );
    expect(r.valid).toBe(true);
  });

  it('rejects if totalRows does not match rows.length', () => {
    const c = makeValidContract([{}, {}]);
    const r = validateContract({ ...c, totalRows: 1 });
    expect(r.valid).toBe(false);
  });
});
