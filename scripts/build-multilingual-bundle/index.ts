#!/usr/bin/env node
// Bundle builder — standalone CLI, zero NestJS / DB deps.
// Reads 11_Multilingual_Content.xlsx (sheet 03_TRANSLATION_QUEUE) and produces
// approved-multilingual-import.json ready for import-multilingual-places.ts.
//
// Usage:
//   npx ts-node scripts/build-multilingual-bundle/index.ts \
//     --xlsx path/to/11_Multilingual_Content.xlsx \
//     --out approved-multilingual-import.json \
//     [--validate-only]   # parse + validate without writing the output file
//
// XLSX sheet: 03_TRANSLATION_QUEUE
// Required columns: see REQUIRED_COLUMNS in bundle-processor.ts
// Optional columns: SOURCE_ID, EVIDENCE_ID, NOTES (ignored)

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parseXlsxSheet } from './xlsx-parser';
import {
  processRows,
  validateHeaders,
  MULTILINGUAL_IMPORT_CONTRACT_VERSION,
} from './bundle-processor';
import {
  MultilingualImportContract,
  MultilingualImportContractSummary,
  computeManifestChecksum,
  validateContract,
} from './contract-standalone';

const SHEET_NAME = '03_TRANSLATION_QUEUE';

function buildBundle(xlsxPath: string, validateOnly: boolean, outPath: string): void {
  console.log(`Reading ${xlsxPath} sheet "${SHEET_NAME}"...`);
  const allRows = parseXlsxSheet(xlsxPath, SHEET_NAME);
  console.log(`  ${allRows.length} data rows found (excluding header)`);

  if (allRows.length === 0) {
    throw new Error(`Sheet "${SHEET_NAME}" is empty or has no data rows after the header`);
  }

  // Validate required columns
  const { missing, extra } = validateHeaders(allRows[0]);
  if (missing.length > 0) {
    throw new Error(`Missing required columns in "${SHEET_NAME}": ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.warn(`  Extra columns (ignored): ${extra.join(', ')}`);
  }

  // Process rows: filter, gate-check, hash
  const { approvedRows, heldRows, parseErrors, sourceChecksum, approvalEvidenceChecksum } = processRows(allRows);

  // Report held rows
  if (heldRows.length > 0) {
    console.log(`\n${heldRows.length} held row(s) (not included in bundle):`);
    for (const hr of heldRows) {
      console.log(`  Row ${hr.rowNumber} place=${hr.placeId} field=${hr.fieldKey} locale=${hr.localeCode}: ${hr.reason}`);
    }
  }

  // Parse errors abort the build
  if (parseErrors.length > 0) {
    console.error(`\n${parseErrors.length} parse error(s):`);
    for (const pe of parseErrors) {
      console.error(`  Row ${pe.rowNumber} ${pe.column}="${pe.value}": ${pe.reason}`);
    }
    throw new Error(`Bundle build aborted due to ${parseErrors.length} parse error(s)`);
  }

  if (approvedRows.length === 0) {
    throw new Error('No approved rows found — bundle would be empty');
  }

  // Build summary
  const byLocale: Record<string, number> = {};
  const byField: Record<string, number> = {};
  for (const r of approvedRows) {
    byLocale[r.localeCode] = (byLocale[r.localeCode] ?? 0) + 1;
    byField[r.fieldKey] = (byField[r.fieldKey] ?? 0) + 1;
  }
  const summary: MultilingualImportContractSummary = {
    byLocale,
    byField,
    totalApproved: approvedRows.length,
    totalHeld: heldRows.length,
    totalRejected: 0,
  };

  const batchId = crypto.randomUUID();
  const publishManifestChecksum = computeManifestChecksum(approvedRows);

  const contract: MultilingualImportContract = {
    contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    batchId,
    sourceChecksum,
    approvalEvidenceChecksum,
    publishManifestChecksum,
    totalRows: approvedRows.length,
    rows: approvedRows,
    summary,
  };

  // Validate the generated bundle (catches any regression in the build logic)
  const validation = validateContract(contract);
  if (!validation.valid) {
    throw new Error(
      `Internal error — generated bundle failed validation:\n${validation.errors.map(e => `  ${e.field}: ${e.message}`).join('\n')}`,
    );
  }

  console.log(`\nBundle summary:`);
  console.log(`  contractVersion:      ${MULTILINGUAL_IMPORT_CONTRACT_VERSION}`);
  console.log(`  batchId:              ${batchId}`);
  console.log(`  sourceChecksum:       ${sourceChecksum}`);
  console.log(`  publishManifest:      ${publishManifestChecksum}`);
  console.log(`  approvedRows:         ${approvedRows.length}`);
  console.log(`  heldRows:             ${heldRows.length}`);
  console.log(`  byLocale:             ${JSON.stringify(byLocale)}`);
  console.log(`  byField:              ${JSON.stringify(byField)}`);

  if (validateOnly) {
    console.log('\n--validate-only: bundle valid, not written to disk');
    return;
  }

  const outAbsolute = path.resolve(outPath);
  fs.writeFileSync(outAbsolute, JSON.stringify(contract, null, 2), 'utf8');
  console.log(`\nBundle written to: ${outAbsolute}`);
  console.log('Next step (dry-run):');
  console.log(`  ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:import-multilingual -- --bundle-path ${outAbsolute} --dry-run`);
}

// CLI entry point
const args = process.argv.slice(2);
const xlsxIndex = args.indexOf('--xlsx');
const outIndex = args.indexOf('--out');
const validateOnly = args.includes('--validate-only');

if (xlsxIndex === -1 || !args[xlsxIndex + 1]) {
  console.error('Usage: build-multilingual-bundle --xlsx <path> [--out <path>] [--validate-only]');
  process.exit(1);
}

const xlsxPath = path.resolve(args[xlsxIndex + 1]);
const outPath = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : 'approved-multilingual-import.json';

try {
  buildBundle(xlsxPath, validateOnly, outPath);
} catch (err) {
  console.error(`\nFatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
