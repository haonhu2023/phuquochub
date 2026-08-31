import { createHash } from 'crypto';
import { MULTILINGUAL_IMPORT_CONTRACT_VERSION } from './multilingual-import.enums';

// ============================================================================
// Contract JSON format — phuquochub.multilingual-import.v1
//
// Produced by scripts/build-multilingual-bundle (no DB); consumed by
// scripts/import-multilingual-places.ts (NestJS + DB). The three checksums
// create a tamper-evident chain: sourceChecksum seals raw XLSX inputs,
// publishManifestChecksum seals the rows array, approvalEvidenceChecksum seals
// combined approval metadata. All sha256 hex over canonicalJson() UTF-8.
// ============================================================================

export const ACCEPTED_TEXT_FORMATS = ['plain_text', 'markdown'] as const;
export const ACCEPTED_TRANSLATION_METHODS = ['original', 'human', 'ai_plus_human', 'official_or_human'] as const;

export type AcceptedTextFormat = typeof ACCEPTED_TEXT_FORMATS[number];
export type AcceptedTranslationMethod = typeof ACCEPTED_TRANSLATION_METHODS[number];

export interface MultilingualImportContractRow {
  // sha256 hex of canonicalJson({all fields below}); recomputed by importer for integrity.
  rowHash: string;
  placeId: string;
  fieldKey: string;
  localeCode: string;
  sourceLocaleCode: string;
  translatedText: string;
  sourceText: string;
  textFormat: AcceptedTextFormat;
  translationMethod: AcceptedTranslationMethod;
  translationStatus: string;
  humanReviewStatus: string;
  qualityGate: string;
  duplicateStatus: string;
  foreignKeyStatus: string;
  validationStatus: string;
  errorCount: number;
  isPublic: boolean;
  isProductionData: boolean;
  productionEligible: boolean;
  sourceId: string | null;
  evidenceId: string | null;
}

export interface MultilingualImportContractSummary {
  byLocale: Record<string, number>;
  byField: Record<string, number>;
  totalApproved: number;
  totalHeld: number;
  totalRejected: number;
}

export interface MultilingualImportContract {
  contractVersion: typeof MULTILINGUAL_IMPORT_CONTRACT_VERSION;
  generatedAt: string;
  batchId: string;
  sourceChecksum: string;
  approvalEvidenceChecksum: string;
  publishManifestChecksum: string;
  totalRows: number;
  rows: MultilingualImportContractRow[];
  summary: MultilingualImportContractSummary;
}

// ============================================================================
// Validation
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

export interface ContractValidationError {
  field: string;
  message: string;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: ContractValidationError[];
}

function ve(field: string, message: string): ContractValidationError {
  return { field, message };
}

// Canonical JSON — key-order-independent. Duplicated from common/canonical-json.ts so that
// scripts/build-multilingual-bundle has zero NestJS deps; both must stay byte-for-byte identical.
export function canonicalJsonContract(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v !== null && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = normalize((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

export function computeRowHash(row: Omit<MultilingualImportContractRow, 'rowHash'>): string {
  return createHash('sha256').update(Buffer.from(canonicalJsonContract(row), 'utf8')).digest('hex');
}

export function computeManifestChecksum(rows: MultilingualImportContractRow[]): string {
  return createHash('sha256').update(Buffer.from(canonicalJsonContract(rows), 'utf8')).digest('hex');
}

export function validateContract(raw: unknown): ContractValidationResult {
  const errors: ContractValidationError[] = [];

  if (raw === null || typeof raw !== 'object') {
    return { valid: false, errors: [ve('root', 'Contract must be a JSON object')] };
  }

  const c = raw as Record<string, unknown>;

  if (c['contractVersion'] !== MULTILINGUAL_IMPORT_CONTRACT_VERSION) {
    errors.push(ve('contractVersion', `Expected "${MULTILINGUAL_IMPORT_CONTRACT_VERSION}", got "${String(c['contractVersion'])}"`));
  }
  if (typeof c['generatedAt'] !== 'string' || !ISO_DATE_RE.test(c['generatedAt'])) {
    errors.push(ve('generatedAt', 'Must be an ISO-8601 datetime string'));
  }
  if (typeof c['batchId'] !== 'string' || !UUID_RE.test(c['batchId'])) {
    errors.push(ve('batchId', 'Must be a UUID v4'));
  }
  for (const field of ['sourceChecksum', 'approvalEvidenceChecksum', 'publishManifestChecksum']) {
    if (typeof c[field] !== 'string' || !HEX64_RE.test(c[field] as string)) {
      errors.push(ve(field, 'Must be a 64-char lowercase hex sha256'));
    }
  }

  if (!Array.isArray(c['rows'])) {
    errors.push(ve('rows', 'Must be an array'));
    return { valid: false, errors };
  }

  const rows = c['rows'] as unknown[];
  if (rows.length === 0) errors.push(ve('rows', 'Must contain at least one row'));
  if (typeof c['totalRows'] !== 'number' || c['totalRows'] !== rows.length) {
    errors.push(ve('totalRows', `Must equal rows.length (${rows.length})`));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>;
    const p = `rows[${i}]`;

    if (typeof r['rowHash'] !== 'string' || !HEX64_RE.test(r['rowHash'])) errors.push(ve(`${p}.rowHash`, 'Must be 64-char hex sha256'));
    if (typeof r['placeId'] !== 'string' || !UUID_RE.test(r['placeId'])) errors.push(ve(`${p}.placeId`, 'Must be a UUID'));
    if (typeof r['fieldKey'] !== 'string' || r['fieldKey'].length === 0 || r['fieldKey'].length > 60) errors.push(ve(`${p}.fieldKey`, 'Must be 1–60 chars'));
    if (typeof r['localeCode'] !== 'string' || r['localeCode'].length === 0) errors.push(ve(`${p}.localeCode`, 'Must be non-empty BCP-47'));
    if (typeof r['sourceLocaleCode'] !== 'string' || r['sourceLocaleCode'].length === 0) errors.push(ve(`${p}.sourceLocaleCode`, 'Must be non-empty'));
    if (typeof r['translatedText'] !== 'string') errors.push(ve(`${p}.translatedText`, 'Must be string'));
    if (typeof r['sourceText'] !== 'string') errors.push(ve(`${p}.sourceText`, 'Must be string'));
    if (!ACCEPTED_TEXT_FORMATS.includes(r['textFormat'] as AcceptedTextFormat)) {
      errors.push(ve(`${p}.textFormat`, `Must be one of: ${ACCEPTED_TEXT_FORMATS.join(', ')}`));
    }
    if (!ACCEPTED_TRANSLATION_METHODS.includes(r['translationMethod'] as AcceptedTranslationMethod)) {
      errors.push(ve(`${p}.translationMethod`, `Must be one of: ${ACCEPTED_TRANSLATION_METHODS.join(', ')}`));
    }
    for (const f of ['translationStatus', 'humanReviewStatus', 'qualityGate', 'duplicateStatus', 'foreignKeyStatus', 'validationStatus']) {
      if (typeof r[f] !== 'string' || (r[f] as string).length === 0) errors.push(ve(`${p}.${f}`, 'Must be non-empty string'));
    }
    if (typeof r['errorCount'] !== 'number' || !Number.isInteger(r['errorCount']) || r['errorCount'] < 0) {
      errors.push(ve(`${p}.errorCount`, 'Must be non-negative integer'));
    }
    for (const f of ['isPublic', 'isProductionData', 'productionEligible']) {
      if (typeof r[f] !== 'boolean') errors.push(ve(`${p}.${f}`, 'Must be boolean'));
    }
    if (r['sourceId'] !== null && (typeof r['sourceId'] !== 'string' || !UUID_RE.test(r['sourceId']))) {
      errors.push(ve(`${p}.sourceId`, 'Must be null or UUID'));
    }
    if (r['evidenceId'] !== null && (typeof r['evidenceId'] !== 'string' || !UUID_RE.test(r['evidenceId']))) {
      errors.push(ve(`${p}.evidenceId`, 'Must be null or UUID'));
    }

    // Verify rowHash matches recomputed value
    if (typeof r['rowHash'] === 'string' && HEX64_RE.test(r['rowHash'])) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rowHash: _rh, ...rest } = r as unknown as MultilingualImportContractRow;
      const expected = computeRowHash(rest as Omit<MultilingualImportContractRow, 'rowHash'>);
      if (expected !== r['rowHash']) {
        errors.push(ve(`${p}.rowHash`, `Hash mismatch: expected ${expected}`));
      }
    }
  }

  // Verify publishManifestChecksum only when all rows passed individual checks
  if (!errors.some(x => x.field.startsWith('rows[')) && HEX64_RE.test((c['publishManifestChecksum'] as string) ?? '')) {
    const recomputed = computeManifestChecksum(rows as MultilingualImportContractRow[]);
    if (recomputed !== c['publishManifestChecksum']) {
      errors.push(ve('publishManifestChecksum', `Checksum mismatch: recomputed ${recomputed}`));
    }
  }

  return { valid: errors.length === 0, errors };
}
