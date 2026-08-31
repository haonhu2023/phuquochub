import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import {
  MultilingualImportContract,
  validateContract,
} from '../modules/multilingual-import/multilingual-import.contract';
import { MultilingualPlaceImportService } from '../modules/multilingual-import/multilingual-place-import.service';

// MULTILINGUAL PLACES IMPORT — CLI runner.
// Follows the same conventions as ingest-verified-facts.ts / backfill-administrative-data.ts:
//   NestFactory.createApplicationContext() (no HTTP server), service via DI, close in finally.
//
// Usage:
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:import-multilingual -- --bundle-path approved-multilingual-import.json --dry-run
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:import-multilingual -- --bundle-path approved-multilingual-import.json --execute
//
// Production additionally requires:
//   NODE_ENV=production
//   ALLOW_PRODUCTION_MULTILINGUAL_IMPORT=true
//   MULTILINGUAL_IMPORT_APPROVED_BATCH_ID=<uuid from bundle>
//   MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM=<sha256 from bundle>
//
// --dry-run is the DEFAULT if neither --dry-run nor --execute is passed.
// There is no --force flag; idempotency is handled by batchId + sourceChecksum uniqueness.

async function main(): Promise<void> {
  const logger = new Logger('MultilingualImportRunner');
  const args = process.argv.slice(2);

  const bundlePathIndex = args.indexOf('--bundle-path');
  if (bundlePathIndex === -1 || !args[bundlePathIndex + 1]) {
    logger.error('Missing --bundle-path <path> argument');
    process.exitCode = 1;
    return;
  }
  const bundlePath = path.resolve(args[bundlePathIndex + 1]);

  const hasExecute = args.includes('--execute');
  const hasDryRun = args.includes('--dry-run');
  // --dry-run wins if both are specified; --execute without --dry-run activates write mode
  const dryRun = !hasExecute || hasDryRun;

  const actorId = process.env['ADMIN_BACKFILL_ACTOR_ID'] ?? '';
  if (!actorId) {
    logger.error(
      'Thiếu ADMIN_BACKFILL_ACTOR_ID — script từ chối chạy để không ghi actor_id rỗng vào audit.',
    );
    process.exitCode = 1;
    return;
  }

  // Read and parse bundle before touching DB or running production checks
  if (!fs.existsSync(bundlePath)) {
    logger.error(`Bundle file not found: ${bundlePath}`);
    process.exitCode = 1;
    return;
  }
  let contract: MultilingualImportContract;
  try {
    const raw = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as unknown;
    contract = raw as MultilingualImportContract;
  } catch (parseErr) {
    logger.error(`Failed to parse bundle JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    process.exitCode = 1;
    return;
  }

  // Validate contract structure + checksums BEFORE booting NestJS / establishing DB connection.
  // Catches tampered or malformed bundles without wasting a DB connection attempt.
  const preValidation = validateContract(contract);
  if (!preValidation.valid) {
    logger.error('Bundle contract validation failed — refusing to boot NestJS:');
    for (const e of preValidation.errors) {
      logger.error(`  ${e.field}: ${e.message}`);
    }
    process.exitCode = 1;
    return;
  }

  logger.log(`Bundle: batchId=${contract.batchId} rows=${contract.totalRows} dryRun=${dryRun}`);

  // Dynamic import to avoid pulling AppModule into specs that only test pure functions
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });

  try {
    const service = app.get(MultilingualPlaceImportService);
    const result = await service.importBundle({ contract, actorId, dryRun });

    logger.log('--- Multilingual Import Result ---');
    logger.log(`batchId:       ${result.batchId}`);
    logger.log(`batchRecordId: ${result.batchRecordId}`);
    logger.log(`dryRun:        ${result.dryRun}`);
    logger.log(`status:        ${result.status}`);
    logger.log(`total/ok/current/held/failed: ${result.totalRows}/${result.succeeded}/${result.alreadyCurrent}/${result.held}/${result.failed}`);

    if (result.errorSummary) {
      logger.error(`Error summary: ${result.errorSummary}`);
    }

    for (const r of result.rowResults) {
      const tag = r.outcome.toUpperCase().padEnd(14);
      logger.log(`  ${tag} place=${r.placeId} field=${r.fieldKey} locale=${r.localeCode}${r.errorDetail ? ` err=${r.errorDetail}` : ''}`);
    }

    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error in import-multilingual-places:', err);
  process.exitCode = 1;
});
