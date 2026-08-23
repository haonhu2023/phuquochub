import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { VerifiedFactsIngestionService } from '../modules/admin-data/verified-facts-ingestion.service';
import { assertNotProduction } from './backfill-administrative-data';

// VERIFIED FACTS INGESTION — CLI runner (2026-08-23). Cùng khuôn `backfill-administrative-data.ts`:
// `NestFactory.createApplicationContext()` (không mở HTTP, không cron), service qua DI, đóng app
// trong `finally`, danh tính người chạy qua BIẾN MÔI TRƯỜNG (arg CLI nằm trong `ps`/shell history).
//
// `assertNotProduction()` IMPORT LẠI từ backfill-administrative-data.ts thay vì chép — đây là
// script GHI dữ liệu, đúng loại mà guard đó tồn tại để chặn; một bản sao thứ hai sẽ trôi khỏi bản gốc.
//
// Usage:
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:ingest-verified-facts -- --dry-run
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:ingest-verified-facts
async function main(): Promise<void> {
  const logger = new Logger('VerifiedFactsIngestionRunner');
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const actorId = process.env.ADMIN_BACKFILL_ACTOR_ID ?? '';

  const safety = assertNotProduction();
  if (!safety.isSafe) {
    logger.error('ABORT — môi trường có dấu hiệu production, script từ chối chạy:');
    for (const reason of safety.reasons) logger.error(`  - ${reason}`);
    process.exitCode = 1;
    return;
  }

  if (!actorId) {
    logger.error(
      'Thiếu ADMIN_BACKFILL_ACTOR_ID (uuid users.id) — script từ chối chạy để không ghi ' +
        'updated_by/editor_id rỗng. Dùng tài khoản đã cấp qua `npm run operator:bootstrap`.',
    );
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const service = app.get(VerifiedFactsIngestionService);
    logger.log(`Starting verified-facts ingestion${dryRun ? ' (DRY RUN — no writes)' : ''}...`);

    const summary = await service.ingest({ actorId, dryRun });

    logger.log('--- Verified Facts Ingestion Summary ---');
    logger.log(`dryRun / targets / ingested / alreadyCurrent / notFound / errors: ${summary.dryRun} / ${summary.totalTargets} / ${summary.ingested} / ${summary.alreadyCurrent} / ${summary.notFound} / ${summary.errors}`);
    for (const r of summary.results) {
      logger.log(
        `  ${r.slug}: ${r.outcome} | evidence=${r.retrievalMethod} reliability=${r.reliability}` +
          `${r.sourceReliabilityCorrected ? ' (CORRECTED)' : ''} | ` +
          `hours=${r.openingHoursWritten ? 'written' : `skipped (${r.openingHoursSkippedReason ?? 'n/a'})`} | ` +
          `partialFact=${r.partialFactRecorded} | ` +
          `contacts +${r.contactsCreated}/=${r.contactsAlreadyPresent} | ` +
          `contactVerifOfficial=${r.contactVerificationsOfficial} | ` +
          `attributions +${r.attributionsCreated}/=${r.attributionsAlreadyPresent} | ` +
          `placeVerification=${r.placeVerificationOutcome}`,
      );
      if (r.error) logger.error(`    error: ${r.error}`);
    }

    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger đã đóng ở nhánh này
    console.error('Verified facts ingestion failed:', err);
    process.exit(1);
  });
}
