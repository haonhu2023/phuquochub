import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { MultilingualImportBatchRepository } from '../modules/multilingual-import/repositories/multilingual-import-batch.repository';
import { MultilingualImportBatch } from '../modules/multilingual-import/entities/multilingual-import-batch.entity';

// CANCEL A PENDING MULTILINGUAL BATCH — governed alternative to a raw UPDATE (2026-09-02
// data-SSOT remediation, Phase 3.6). Only ever moves PENDING -> CANCELLED; the repository method
// this calls refuses (throws) if the batch is not currently PENDING, so it cannot be used to alter
// a batch that already ran. Never deletes anything.
//
// Usage:
//   npm run admin:cancel-multilingual-batch -- --batch-record-id <uuid> --reason "..."
//
// Deliberately does NOT boot the full NestFactory.createApplicationContext(AppModule) that every
// other apps/api/src/scripts/*.ts CLI uses — this action touches exactly one table and needs none
// of AppModule's other modules (auth/storage/rate-limit/scheduler/...), and booting the full app
// for a single guarded UPDATE pulled in unrelated service dependencies that made the process hang.
// Instead it wires MultilingualImportBatchRepository directly against a plain TypeORM DataSource —
// the SAME class and the SAME guarded cancelPending() method the Nest-DI path would use, just
// constructed by hand instead of through the DI container. Not a parallel/duplicate implementation.

async function main(): Promise<void> {
  const logger = new Logger('CancelMultilingualBatch');
  const args = process.argv.slice(2);

  const idIndex = args.indexOf('--batch-record-id');
  if (idIndex === -1 || !args[idIndex + 1]) {
    logger.error('Missing --batch-record-id <uuid> argument');
    process.exitCode = 1;
    return;
  }
  const batchRecordId = args[idIndex + 1];

  const reasonIndex = args.indexOf('--reason');
  if (reasonIndex === -1 || !args[reasonIndex + 1]) {
    logger.error('Missing --reason "<text>" argument');
    process.exitCode = 1;
    return;
  }
  const reason = args[reasonIndex + 1];

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    const typeormRepo = dataSource.getRepository(MultilingualImportBatch);
    const repo = new MultilingualImportBatchRepository(typeormRepo);

    const before = await repo.findById(batchRecordId);
    if (!before) {
      logger.error(`Batch ${batchRecordId} not found.`);
      process.exitCode = 1;
      return;
    }
    logger.log(`Batch ${batchRecordId} (batchId=${before.batchId}) current status=${before.status}, dryRun=${before.dryRun}, startedAt=${before.startedAt}`);

    await repo.cancelPending(batchRecordId, reason);

    const after = await repo.findById(batchRecordId);
    logger.log(`Batch ${batchRecordId} now status=${after?.status}, cancellationReason="${after?.cancellationReason}"`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error in cancel-multilingual-batch:', err);
  process.exitCode = 1;
});
