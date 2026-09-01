// Pure row-processing logic for the multilingual bundle builder.
// No file I/O, no NestJS, no DB. Exported so unit tests can call it directly.

import * as crypto from 'crypto';
import { SheetRow, XLSX_FORMULA_NO_CACHE, XLSX_FORMULA_ERROR } from './xlsx-parser';
import {
  MultilingualImportContractRow,
  ACCEPTED_TEXT_FORMATS,
  ACCEPTED_TRANSLATION_METHODS,
  canonicalJsonContract,
  computeRowHash,
  MULTILINGUAL_IMPORT_CONTRACT_VERSION,
} from './contract-standalone';

export { MULTILINGUAL_IMPORT_CONTRACT_VERSION };

// ============================================================================
// Types
// ============================================================================

export interface ParseError {
  rowNumber: number;
  column: string;
  value: string;
  reason: string;
}

export interface HeldRow {
  rowNumber: number;
  placeId: string;
  fieldKey: string;
  localeCode: string;
  reason: string;
}

export interface ProcessRowsResult {
  approvedRows: MultilingualImportContractRow[];
  heldRows: HeldRow[];
  parseErrors: ParseError[];
  sourceChecksum: string;
  approvalEvidenceChecksum: string;
}

// Quality gate values the XLSX uses to mark a row as production-eligible.
export const ACCEPTED_QUALITY_GATES = ['PASS', 'APPROVED_FOR_IMPORT', 'APPROVED_FOR_PUBLISH'] as const;

// ============================================================================
// Helpers
// ============================================================================

export const REQUIRED_COLUMNS = [
  'PLACE_ID', 'FIELD_KEY', 'LOCALE_CODE', 'SOURCE_LOCALE_CODE',
  'TRANSLATED_TEXT', 'SOURCE_TEXT', 'TEXT_FORMAT', 'TRANSLATION_METHOD',
  'TRANSLATION_STATUS', 'HUMAN_REVIEW_STATUS', 'QUALITY_GATE',
  'DUPLICATE_STATUS', 'FOREIGN_KEY_STATUS', 'VALIDATION_STATUS', 'ERROR_COUNT',
  'IS_PUBLIC', 'IS_PRODUCTION_DATA', 'PRODUCTION_ELIGIBLE', 'IS_CURRENT',
] as const;

export type RequiredColumn = typeof REQUIRED_COLUMNS[number];

function sha256hex(data: string): string {
  return crypto.createHash('sha256').update(Buffer.from(data, 'utf8')).digest('hex');
}

export function parseBoolean(val: string | undefined): boolean | null {
  const v = (val ?? '').toLowerCase().trim();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

function isSentinel(val: string): boolean {
  return val === XLSX_FORMULA_NO_CACHE || val === XLSX_FORMULA_ERROR;
}

function sentinelReason(val: string): string {
  if (val === XLSX_FORMULA_NO_CACHE) return 'cell contains a formula with no cached value — recalculate XLSX before building bundle';
  if (val === XLSX_FORMULA_ERROR) return 'cell contains a formula error (e.g. #DIV/0!, #REF!, #NAME?) — fix XLSX before building bundle';
  return `unknown sentinel: ${val}`;
}

// ============================================================================
// Header validation (exported for testing)
// ============================================================================

export function validateHeaders(firstRow: SheetRow): { missing: string[]; extra: string[] } {
  const actualCols = Object.keys(firstRow);
  const required = REQUIRED_COLUMNS as readonly string[];
  const optionalCols = ['SOURCE_ID', 'EVIDENCE_ID', 'NOTES'];
  const missing = required.filter(col => !actualCols.includes(col));
  const extra = actualCols.filter(col => !required.includes(col) && !optionalCols.includes(col));
  return { missing, extra };
}

// ============================================================================
// Core processing
// ============================================================================

export function processRows(allRows: SheetRow[]): ProcessRowsResult {
  const parseErrors: ParseError[] = [];
  const heldRows: HeldRow[] = [];
  const approvedRows: MultilingualImportContractRow[] = [];

  // Source checksum: over all raw XLSX rows before any filtering
  const sourceChecksum = sha256hex(canonicalJsonContract(allRows));

  // Approval evidence checksum: over approval metadata only
  const approvalEvidence = allRows.map(r => ({
    place_id: r['PLACE_ID'],
    field_key: r['FIELD_KEY'],
    locale_code: r['LOCALE_CODE'],
    human_review_status: r['HUMAN_REVIEW_STATUS'],
    translation_status: r['TRANSLATION_STATUS'],
  }));
  const approvalEvidenceChecksum = sha256hex(canonicalJsonContract(approvalEvidence));

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as SheetRow;
    const rowNumber = i + 2; // +2: header is row 1, data starts at row 2

    const placeId = row['PLACE_ID'] ?? '';
    const fieldKey = row['FIELD_KEY'] ?? '';
    const localeCode = row['LOCALE_CODE'] ?? '';

    // Skip TEMPLATE rows silently — not an error, not held
    if (row['TRANSLATION_STATUS'] === 'TEMPLATE') {
      continue;
    }

    // Check for formula sentinel values in any column before other processing
    const sentinelCell = REQUIRED_COLUMNS.find(col => isSentinel(row[col] ?? ''));
    if (sentinelCell) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `Column ${sentinelCell}: ${sentinelReason(row[sentinelCell])}`,
      });
      continue;
    }

    // Only APPROVED translation status proceeds
    if (row['TRANSLATION_STATUS'] !== 'APPROVED') {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `TRANSLATION_STATUS=${row['TRANSLATION_STATUS']} (expected APPROVED)`,
      });
      continue;
    }

    // IS_CURRENT must be YES (active/current translation version)
    if (parseBoolean(row['IS_CURRENT']) !== true) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `IS_CURRENT=${row['IS_CURRENT']} (expected YES — only import current/active content)`,
      });
      continue;
    }

    // QUALITY_GATE must be an accepted value
    if (!ACCEPTED_QUALITY_GATES.includes(row['QUALITY_GATE'] as typeof ACCEPTED_QUALITY_GATES[number])) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `QUALITY_GATE=${row['QUALITY_GATE']} (accepted: ${ACCEPTED_QUALITY_GATES.join(', ')})`,
      });
      continue;
    }

    // PRODUCTION_ELIGIBLE must be YES
    if (parseBoolean(row['PRODUCTION_ELIGIBLE']) !== true) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `PRODUCTION_ELIGIBLE=${row['PRODUCTION_ELIGIBLE']} (expected YES)`,
      });
      continue;
    }

    // IS_PRODUCTION_DATA must be YES
    if (parseBoolean(row['IS_PRODUCTION_DATA']) !== true) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `IS_PRODUCTION_DATA=${row['IS_PRODUCTION_DATA']} (expected YES)`,
      });
      continue;
    }

    // DUPLICATE_STATUS must be CLEAR
    if (row['DUPLICATE_STATUS'] !== 'CLEAR') {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `DUPLICATE_STATUS=${row['DUPLICATE_STATUS']} (expected CLEAR)`,
      });
      continue;
    }

    // FOREIGN_KEY_STATUS must be PASS
    if (row['FOREIGN_KEY_STATUS'] !== 'PASS') {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `FOREIGN_KEY_STATUS=${row['FOREIGN_KEY_STATUS']} (expected PASS)`,
      });
      continue;
    }

    // VALIDATION_STATUS must not be FAIL
    if (row['VALIDATION_STATUS'] === 'FAIL') {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `VALIDATION_STATUS=FAIL`,
      });
      continue;
    }

    // ERROR_COUNT must be 0
    const errorCount = parseInt(row['ERROR_COUNT'] ?? '0', 10);
    if (!isNaN(errorCount) && errorCount > 0) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `ERROR_COUNT=${errorCount} (expected 0)`,
      });
      continue;
    }

    // AI+human translation requires human approval before production import
    if (
      row['TRANSLATION_METHOD'] === 'ai_plus_human' &&
      row['HUMAN_REVIEW_STATUS'] !== 'APPROVED' &&
      parseBoolean(row['IS_PRODUCTION_DATA']) === true
    ) {
      heldRows.push({
        rowNumber, placeId, fieldKey, localeCode,
        reason: `TRANSLATION_METHOD=ai_plus_human requires HUMAN_REVIEW_STATUS=APPROVED when IS_PRODUCTION_DATA=YES`,
      });
      continue;
    }

    // Field-level validation
    const rowErrors: ParseError[] = [];

    if (!UUID_RE.test(placeId)) rowErrors.push({ rowNumber, column: 'PLACE_ID', value: placeId, reason: 'Must be a UUID' });
    if (!fieldKey || fieldKey.length > 60) rowErrors.push({ rowNumber, column: 'FIELD_KEY', value: fieldKey, reason: '1–60 chars required' });
    if (!localeCode) rowErrors.push({ rowNumber, column: 'LOCALE_CODE', value: '', reason: 'Required' });
    if (!row['SOURCE_LOCALE_CODE']) rowErrors.push({ rowNumber, column: 'SOURCE_LOCALE_CODE', value: '', reason: 'Required' });
    if (!ACCEPTED_TEXT_FORMATS.includes(row['TEXT_FORMAT'] as typeof ACCEPTED_TEXT_FORMATS[number])) {
      rowErrors.push({ rowNumber, column: 'TEXT_FORMAT', value: row['TEXT_FORMAT'] ?? '', reason: `Must be one of: ${ACCEPTED_TEXT_FORMATS.join(', ')}` });
    }
    if (!ACCEPTED_TRANSLATION_METHODS.includes(row['TRANSLATION_METHOD'] as typeof ACCEPTED_TRANSLATION_METHODS[number])) {
      rowErrors.push({ rowNumber, column: 'TRANSLATION_METHOD', value: row['TRANSLATION_METHOD'] ?? '', reason: `Must be one of: ${ACCEPTED_TRANSLATION_METHODS.join(', ')}` });
    }
    if (isNaN(errorCount) || errorCount < 0) {
      rowErrors.push({ rowNumber, column: 'ERROR_COUNT', value: row['ERROR_COUNT'] ?? '', reason: 'Must be non-negative integer' });
    }

    if (rowErrors.length > 0) {
      parseErrors.push(...rowErrors);
      continue;
    }

    const isPublic = parseBoolean(row['IS_PUBLIC']);
    const isProductionData = parseBoolean(row['IS_PRODUCTION_DATA']);
    const productionEligible = parseBoolean(row['PRODUCTION_ELIGIBLE']);

    if (isPublic === null || isProductionData === null || productionEligible === null) {
      parseErrors.push({ rowNumber, column: 'IS_PUBLIC/IS_PRODUCTION_DATA/PRODUCTION_ELIGIBLE', value: '', reason: 'Boolean columns must be YES/NO/true/false' });
      continue;
    }

    const rowWithoutHash: Omit<MultilingualImportContractRow, 'rowHash'> = {
      placeId,
      fieldKey,
      localeCode,
      sourceLocaleCode: row['SOURCE_LOCALE_CODE'],
      translatedText: row['TRANSLATED_TEXT'] ?? '',
      sourceText: row['SOURCE_TEXT'] ?? '',
      textFormat: row['TEXT_FORMAT'] as typeof ACCEPTED_TEXT_FORMATS[number],
      translationMethod: row['TRANSLATION_METHOD'] as typeof ACCEPTED_TRANSLATION_METHODS[number],
      translationStatus: row['TRANSLATION_STATUS'],
      humanReviewStatus: row['HUMAN_REVIEW_STATUS'] ?? '',
      qualityGate: row['QUALITY_GATE'] ?? '',
      duplicateStatus: row['DUPLICATE_STATUS'] ?? '',
      foreignKeyStatus: row['FOREIGN_KEY_STATUS'] ?? '',
      validationStatus: row['VALIDATION_STATUS'] ?? '',
      errorCount,
      isPublic,
      isProductionData,
      productionEligible,
      sourceId: UUID_RE.test(row['SOURCE_ID'] ?? '') ? (row['SOURCE_ID'] ?? null) : null,
      evidenceId: UUID_RE.test(row['EVIDENCE_ID'] ?? '') ? (row['EVIDENCE_ID'] ?? null) : null,
    };

    approvedRows.push({ ...rowWithoutHash, rowHash: computeRowHash(rowWithoutHash) });
  }

  return { approvedRows, heldRows, parseErrors, sourceChecksum, approvalEvidenceChecksum };
}
