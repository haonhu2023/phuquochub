// Bundle-builder unit tests — exercises processRows() and validateHeaders() pure functions.
// No file I/O, no XLSX parsing, no NestJS, no DB.
//
// Import path: 6 directories up from __tests__/ to reach the monorepo root, then into scripts/.
// Deduplication at bundle level is intentionally NOT implemented — DB unique constraints
// (uq_place_trans_current, uq_import_batch_source_checksum_succeeded) are the enforcement layer.

import {
  processRows,
  validateHeaders,
  parseBoolean,
  REQUIRED_COLUMNS,
  ACCEPTED_QUALITY_GATES,
} from '../../../../../../scripts/build-multilingual-bundle/bundle-processor';
import {
  XLSX_FORMULA_NO_CACHE,
  XLSX_FORMULA_ERROR,
} from '../../../../../../scripts/build-multilingual-bundle/xlsx-parser';
import type { SheetRow } from '../../../../../../scripts/build-multilingual-bundle/xlsx-parser';

// ============================================================================
// Fixture factories
// ============================================================================

const VALID_PLACE_ID = '12345678-1234-4234-a234-123456789abc';
const VALID_PLACE_ID_2 = 'abcdef12-abcd-4bcd-abcd-abcdef123456';

function makeRow(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    PLACE_ID: VALID_PLACE_ID,
    FIELD_KEY: 'short_description',
    LOCALE_CODE: 'vi',
    SOURCE_LOCALE_CODE: 'vi',
    TRANSLATED_TEXT: 'Mô tả ngắn về địa điểm',
    SOURCE_TEXT: 'Mô tả ngắn về địa điểm',
    TEXT_FORMAT: 'plain_text',
    TRANSLATION_METHOD: 'original',
    TRANSLATION_STATUS: 'APPROVED',
    HUMAN_REVIEW_STATUS: 'APPROVED',
    QUALITY_GATE: 'PASS',
    DUPLICATE_STATUS: 'CLEAR',
    FOREIGN_KEY_STATUS: 'PASS',
    VALIDATION_STATUS: 'PASS',
    ERROR_COUNT: '0',
    IS_PUBLIC: 'YES',
    IS_PRODUCTION_DATA: 'YES',
    PRODUCTION_ELIGIBLE: 'YES',
    IS_CURRENT: 'YES',
    ...overrides,
  };
}

// ============================================================================
// parseBoolean
// ============================================================================

describe('parseBoolean', () => {
  it.each([['true', true], ['1', true], ['yes', true], ['YES', true]])(
    'parses "%s" as true', (input, expected) => {
      expect(parseBoolean(input)).toBe(expected);
    },
  );
  it.each([['false', false], ['0', false], ['no', false], ['NO', false]])(
    'parses "%s" as false', (input, expected) => {
      expect(parseBoolean(input)).toBe(expected);
    },
  );
  it('returns null for unrecognized values', () => {
    expect(parseBoolean('maybe')).toBeNull();
    expect(parseBoolean('')).toBeNull();
    expect(parseBoolean(undefined)).toBeNull();
  });
});

// ============================================================================
// validateHeaders
// ============================================================================

describe('validateHeaders', () => {
  it('returns no missing/extra for an exact header set', () => {
    const row: SheetRow = Object.fromEntries(REQUIRED_COLUMNS.map(c => [c, '']));
    const { missing, extra } = validateHeaders(row);
    expect(missing).toHaveLength(0);
    expect(extra).toHaveLength(0);
  });

  it('reports missing required columns', () => {
    const row: SheetRow = Object.fromEntries(
      REQUIRED_COLUMNS.filter(c => c !== 'QUALITY_GATE' && c !== 'IS_CURRENT').map(c => [c, '']),
    );
    const { missing } = validateHeaders(row);
    expect(missing).toContain('QUALITY_GATE');
    expect(missing).toContain('IS_CURRENT');
  });

  it('reports extra unknown columns (not optional SOURCE_ID/EVIDENCE_ID/NOTES)', () => {
    const row: SheetRow = Object.fromEntries(REQUIRED_COLUMNS.map(c => [c, '']));
    row['UNKNOWN_COL'] = '';
    const { extra } = validateHeaders(row);
    expect(extra).toContain('UNKNOWN_COL');
  });

  it('treats SOURCE_ID, EVIDENCE_ID, NOTES as optional (not extra)', () => {
    const row: SheetRow = Object.fromEntries(REQUIRED_COLUMNS.map(c => [c, '']));
    row['SOURCE_ID'] = '';
    row['EVIDENCE_ID'] = '';
    row['NOTES'] = '';
    const { extra } = validateHeaders(row);
    expect(extra).toHaveLength(0);
  });
});

// ============================================================================
// processRows — happy paths
// ============================================================================

describe('processRows — valid vi row', () => {
  it('produces one approved row with correct field mapping', () => {
    const { approvedRows, heldRows, parseErrors } = processRows([makeRow()]);
    expect(parseErrors).toHaveLength(0);
    expect(heldRows).toHaveLength(0);
    expect(approvedRows).toHaveLength(1);
    const r = approvedRows[0];
    expect(r.placeId).toBe(VALID_PLACE_ID);
    expect(r.fieldKey).toBe('short_description');
    expect(r.localeCode).toBe('vi');
    expect(r.translationMethod).toBe('original');
    expect(r.isPublic).toBe(true);
    expect(r.isProductionData).toBe(true);
    expect(r.productionEligible).toBe(true);
  });

  it('attaches a 64-char rowHash to every approved row', () => {
    const { approvedRows } = processRows([makeRow()]);
    expect(approvedRows[0].rowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces non-empty sourceChecksum and approvalEvidenceChecksum', () => {
    const { sourceChecksum, approvalEvidenceChecksum } = processRows([makeRow()]);
    expect(sourceChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(approvalEvidenceChecksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('processRows — valid en row', () => {
  it('produces one approved en row', () => {
    const row = makeRow({
      PLACE_ID: VALID_PLACE_ID_2,
      LOCALE_CODE: 'en',
      SOURCE_LOCALE_CODE: 'en',
      TRANSLATED_TEXT: 'Short place description',
      SOURCE_TEXT: 'Short place description',
    });
    const { approvedRows, heldRows, parseErrors } = processRows([row]);
    expect(parseErrors).toHaveLength(0);
    expect(heldRows).toHaveLength(0);
    expect(approvedRows[0].localeCode).toBe('en');
    expect(approvedRows[0].placeId).toBe(VALID_PLACE_ID_2);
  });
});

describe('processRows — mixed vi and en rows', () => {
  it('approves both rows, checksums differ from single-row run', () => {
    const vi = makeRow({ LOCALE_CODE: 'vi' });
    const en = makeRow({ LOCALE_CODE: 'en', TRANSLATED_TEXT: 'Short description' });
    const { approvedRows, sourceChecksum } = processRows([vi, en]);
    expect(approvedRows).toHaveLength(2);

    const { sourceChecksum: single } = processRows([vi]);
    expect(sourceChecksum).not.toBe(single); // checksum covers raw rows, so size change detected
  });
});

// ============================================================================
// processRows — HOLD cases
// ============================================================================

describe('processRows — TEMPLATE row skipped', () => {
  it('skips rows with TRANSLATION_STATUS=TEMPLATE silently', () => {
    const { approvedRows, heldRows, parseErrors } = processRows([
      makeRow({ TRANSLATION_STATUS: 'TEMPLATE' }),
    ]);
    expect(parseErrors).toHaveLength(0);
    expect(heldRows).toHaveLength(0);   // silently skipped, not held
    expect(approvedRows).toHaveLength(0);
  });

  it('processes non-TEMPLATE rows alongside a TEMPLATE row', () => {
    const { approvedRows } = processRows([
      makeRow({ TRANSLATION_STATUS: 'TEMPLATE' }),
      makeRow({ LOCALE_CODE: 'en', TRANSLATED_TEXT: 'Hello' }),
    ]);
    expect(approvedRows).toHaveLength(1);
    expect(approvedRows[0].localeCode).toBe('en');
  });
});

describe('processRows — FOREIGN_KEY_STATUS fail (foreign key evidence missing)', () => {
  it('holds a row with FOREIGN_KEY_STATUS=FAIL', () => {
    const { heldRows, approvedRows } = processRows([makeRow({ FOREIGN_KEY_STATUS: 'FAIL' })]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/FOREIGN_KEY_STATUS/);
  });
});

describe('processRows — ai_plus_human without human approval (machine translation not approved)', () => {
  it('holds ai_plus_human IS_PRODUCTION_DATA=YES without HUMAN_REVIEW_STATUS=APPROVED', () => {
    const row = makeRow({
      TRANSLATION_METHOD: 'ai_plus_human',
      HUMAN_REVIEW_STATUS: 'PENDING',
    });
    const { heldRows, approvedRows } = processRows([row]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/ai_plus_human/);
    expect(heldRows[0].reason).toMatch(/HUMAN_REVIEW_STATUS/);
  });

  it('approves ai_plus_human when HUMAN_REVIEW_STATUS=APPROVED', () => {
    const row = makeRow({
      TRANSLATION_METHOD: 'ai_plus_human',
      HUMAN_REVIEW_STATUS: 'APPROVED',
    });
    const { approvedRows } = processRows([row]);
    expect(approvedRows).toHaveLength(1);
    expect(approvedRows[0].translationMethod).toBe('ai_plus_human');
  });
});

describe('processRows — QUALITY_GATE fail', () => {
  it('holds a row with QUALITY_GATE=FAIL', () => {
    const { heldRows, approvedRows } = processRows([makeRow({ QUALITY_GATE: 'FAIL' })]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/QUALITY_GATE/);
  });

  it('holds a row with QUALITY_GATE=REVIEW_NEEDED', () => {
    const { heldRows } = processRows([makeRow({ QUALITY_GATE: 'REVIEW_NEEDED' })]);
    expect(heldRows).toHaveLength(1);
  });

  it.each(ACCEPTED_QUALITY_GATES)('approves QUALITY_GATE=%s', (gate) => {
    const { approvedRows } = processRows([makeRow({ QUALITY_GATE: gate })]);
    expect(approvedRows).toHaveLength(1);
  });
});

describe('processRows — formula sentinel cells (no cached value)', () => {
  it('holds a row with XLSX_FORMULA_NO_CACHE in TRANSLATED_TEXT', () => {
    const { heldRows, approvedRows } = processRows([
      makeRow({ TRANSLATED_TEXT: XLSX_FORMULA_NO_CACHE }),
    ]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/TRANSLATED_TEXT/);
    expect(heldRows[0].reason).toMatch(/formula/i);
  });

  it('holds a row with XLSX_FORMULA_ERROR in QUALITY_GATE', () => {
    const { heldRows } = processRows([makeRow({ QUALITY_GATE: XLSX_FORMULA_ERROR })]);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/QUALITY_GATE/);
    expect(heldRows[0].reason).toMatch(/error/i);
  });

  it('holds a row with XLSX_FORMULA_NO_CACHE in any required column', () => {
    for (const col of REQUIRED_COLUMNS) {
      // Either held for sentinel or held for a gate check — must not be approved
      const { approvedRows } = processRows([makeRow({ [col]: XLSX_FORMULA_NO_CACHE })]);
      expect(approvedRows).toHaveLength(0);
    }
  });
});

describe('processRows — IS_CURRENT not YES', () => {
  it('holds a row with IS_CURRENT=NO', () => {
    const { heldRows, approvedRows } = processRows([makeRow({ IS_CURRENT: 'NO' })]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/IS_CURRENT/);
  });

  it('holds a row with IS_CURRENT empty', () => {
    const { heldRows } = processRows([makeRow({ IS_CURRENT: '' })]);
    expect(heldRows).toHaveLength(1);
  });
});

describe('processRows — TRANSLATION_STATUS not APPROVED', () => {
  it('holds PENDING status', () => {
    const { heldRows } = processRows([makeRow({ TRANSLATION_STATUS: 'PENDING' })]);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/TRANSLATION_STATUS/);
  });

  it('holds REVIEW status', () => {
    const { heldRows } = processRows([makeRow({ TRANSLATION_STATUS: 'REVIEW' })]);
    expect(heldRows).toHaveLength(1);
  });
});

describe('processRows — DUPLICATE_STATUS not CLEAR', () => {
  it('holds a row with DUPLICATE_STATUS=DUPLICATE', () => {
    const { heldRows, approvedRows } = processRows([makeRow({ DUPLICATE_STATUS: 'DUPLICATE' })]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/DUPLICATE_STATUS/);
  });
});

describe('processRows — VALIDATION_STATUS fail', () => {
  it('holds VALIDATION_STATUS=FAIL', () => {
    const { heldRows, approvedRows } = processRows([makeRow({ VALIDATION_STATUS: 'FAIL' })]);
    expect(approvedRows).toHaveLength(0);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/VALIDATION_STATUS/);
  });
});

describe('processRows — ERROR_COUNT > 0', () => {
  it('holds rows with ERROR_COUNT=1', () => {
    const { heldRows } = processRows([makeRow({ ERROR_COUNT: '1' })]);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0].reason).toMatch(/ERROR_COUNT/);
  });
});

// ============================================================================
// processRows — duplicate rows (builder does NOT deduplicate — DB layer does)
// ============================================================================

describe('processRows — duplicate rows', () => {
  it('allows duplicate place_id+field_key+locale through (DB enforces uniqueness)', () => {
    // Two rows with the same place+field+locale: both pass gate checks.
    // The DB partial unique index uq_place_trans_current prevents both from being current.
    const row1 = makeRow({ TRANSLATED_TEXT: 'Version A' });
    const row2 = makeRow({ TRANSLATED_TEXT: 'Version B' });
    const { approvedRows } = processRows([row1, row2]);
    expect(approvedRows).toHaveLength(2);
  });

  it('rows with identical content have different rowHashes when translatedText differs', () => {
    const row1 = makeRow({ TRANSLATED_TEXT: 'Text one' });
    const row2 = makeRow({ TRANSLATED_TEXT: 'Text two' });
    const { approvedRows } = processRows([row1, row2]);
    expect(approvedRows[0].rowHash).not.toBe(approvedRows[1].rowHash);
  });

  it('rows with identical content produce the same rowHash', () => {
    const row1 = makeRow();
    const row2 = makeRow();
    const { approvedRows } = processRows([row1, row2]);
    expect(approvedRows).toHaveLength(2);
    expect(approvedRows[0].rowHash).toBe(approvedRows[1].rowHash);
  });
});

// ============================================================================
// processRows — checksum coverage
// ============================================================================

describe('processRows — sourceChecksum covers all rows including held/TEMPLATE', () => {
  it('sourceChecksum changes when held rows change (covers raw input)', () => {
    const onlyApproved = processRows([makeRow()]);
    const withHeld = processRows([makeRow(), makeRow({ TRANSLATION_STATUS: 'PENDING' })]);
    expect(onlyApproved.sourceChecksum).not.toBe(withHeld.sourceChecksum);
  });

  it('sourceChecksum changes when TEMPLATE rows change (covers raw input)', () => {
    const without = processRows([makeRow()]);
    const withTemplate = processRows([makeRow({ TRANSLATION_STATUS: 'TEMPLATE' }), makeRow()]);
    expect(without.sourceChecksum).not.toBe(withTemplate.sourceChecksum);
  });
});

// ============================================================================
// processRows — parse errors abort the affected row
// ============================================================================

describe('processRows — parse errors', () => {
  it('records a parse error for an invalid PLACE_ID', () => {
    const { parseErrors, approvedRows } = processRows([makeRow({ PLACE_ID: 'not-a-uuid' })]);
    expect(approvedRows).toHaveLength(0);
    expect(parseErrors.some(e => e.column === 'PLACE_ID')).toBe(true);
  });

  it('records a parse error for an invalid TEXT_FORMAT', () => {
    const { parseErrors } = processRows([makeRow({ TEXT_FORMAT: 'html' })]);
    expect(parseErrors.some(e => e.column === 'TEXT_FORMAT')).toBe(true);
  });

  it('records a parse error for an unrecognized TRANSLATION_METHOD', () => {
    const { parseErrors } = processRows([makeRow({ TRANSLATION_METHOD: 'google_translate' })]);
    expect(parseErrors.some(e => e.column === 'TRANSLATION_METHOD')).toBe(true);
  });
});
