import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { MediaCleanupService } from '../modules/media/media-cleanup.service';

// Media Orphan Cleanup (2026-08-02, Owner-approved execution plan). Standalone manual runner —
// no HTTP server started, no scheduler, no queue (see execution plan §6). First use of
// NestFactory.createApplicationContext() in this repo (main.ts uses NestFactory.create() for the
// HTTP server) — the standard, idiomatic Nest pattern for a one-off CLI script that still needs
// full DI (TypeORM connection, ConfigService-resolved S3/DB config, AuditService, etc.).
//
// Usage:
//   npm run media:cleanup                 -- real run (deletes storage objects + soft-deletes rows)
//   npm run media:cleanup -- --dry-run     -- read-only: same candidate query, zero writes
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const logger = new Logger('MediaOrphanCleanupRunner');

  try {
    const service = app.get(MediaCleanupService);
    logger.log(`Starting media orphan cleanup${dryRun ? ' (DRY RUN — no writes will be made)' : ''}...`);

    const summary = await service.run({ dryRun });

    logger.log('--- Media Orphan Cleanup Summary ---');
    logger.log(`dryRun:              ${summary.dryRun}`);
    logger.log(`scanned:             ${summary.scanned}`);
    logger.log(`eligible:            ${summary.eligible}`);
    logger.log(`deleted:             ${summary.deleted}`);
    logger.log(`notFound:            ${summary.notFound}`);
    logger.log(`skippedNoObjectKey:  ${summary.skippedNoObjectKey}`);
    logger.log(`alreadyHandled:      ${summary.alreadyHandled}`);
    logger.log(`errors:              ${summary.errors}`);
    logger.log(`batchesRun:          ${summary.batchesRun}`);
    logger.log(`timeBudgetExceeded:  ${summary.timeBudgetExceeded}`);
    logger.log(`oldestCandidate:     ${summary.oldestCandidateCreatedAt?.toISOString() ?? 'n/a'}`);
    logger.log(`newestCandidate:     ${summary.newestCandidateCreatedAt?.toISOString() ?? 'n/a'}`);
    logger.log(`durationMs:          ${summary.durationMs}`);
    if (summary.sampleCandidates.length > 0) {
      logger.log(`sample (first ${summary.sampleCandidates.length}):`);
      for (const c of summary.sampleCandidates) {
        logger.log(`  - id=${c.id} objectKey=${c.objectKey ?? 'null'}`);
      }
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger already closed on this path
    console.error('Media orphan cleanup failed:', err);
    process.exit(1);
  });
