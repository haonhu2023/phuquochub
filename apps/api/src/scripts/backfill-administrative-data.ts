import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { AdministrativeBackfillService } from '../modules/admin-data/administrative-backfill.service';

// ADMINISTRATIVE DATA BACKFILL (2026-08-18) — cùng khuôn `expire-overdue-verifications.ts`/
// `bootstrap-operator.ts`: `NestFactory.createApplicationContext()` (KHÔNG mở HTTP server, KHÔNG
// đăng ký cron), lấy service qua DI, đóng app trong `finally`.
//
// Danh tính người chạy đến từ BIẾN MÔI TRƯỜNG (không phải CLI arg — cùng lý do
// `bootstrap-operator.ts`: đối số CLI nằm trong `ps`/shell history, biến môi trường thì không).
// PHẢI là uuid users.id CÓ THẬT — `places.updated_by`/`wiki_revisions.editor_id` có FK tới
// `users`, và script này ghi qua ĐÚNG luồng PATCH thật (PlacesService.update()), không bypass FK
// bằng cách viết NULL. Dùng tài khoản đã được cấp qua `operator:bootstrap` trước đó.
//
// Chạy lại AN TOÀN (idempotent) — xem administrative-backfill.service.ts để biết cơ chế.
//
// Usage:
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:backfill-administrative-data
//   ADMIN_BACKFILL_ACTOR_ID=<uuid> npm run admin:backfill-administrative-data -- --dry-run
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const actorId = process.env.ADMIN_BACKFILL_ACTOR_ID ?? '';

  const logger = new Logger('AdministrativeBackfillRunner');

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
    const service = app.get(AdministrativeBackfillService);
    logger.log(`Starting administrative data backfill${dryRun ? ' (DRY RUN — no writes will be made)' : ''}...`);

    const summary = await service.backfill({ actorId, dryRun });

    logger.log('--- Administrative Data Backfill Summary ---');
    logger.log(`dryRun:                          ${summary.dryRun}`);
    logger.log(`sourceId:                        ${summary.sourceId ?? 'n/a (dry-run, not yet created)'}`);
    logger.log(`sourceCreated:                   ${summary.sourceCreated}`);
    logger.log(`totalTargets:                    ${summary.totalTargets}`);
    logger.log(`processed:                       ${summary.processed}`);
    logger.log(`patched:                         ${summary.patched}`);
    logger.log(`alreadyCorrect:                  ${summary.alreadyCorrect}`);
    logger.log(`notFound:                        ${summary.notFound}`);
    logger.log(`errors:                          ${summary.errors}`);
    logger.log(`revisionsCreated:                ${summary.revisionsCreated}`);
    logger.log(`placeFieldAttributionsCreated:   ${summary.placeFieldAttributionsCreated}`);
    logger.log(`placeFieldAttributionsExisting:  ${summary.placeFieldAttributionsAlreadyPresent}`);
    logger.log(`wikiRevisionAttributionsCreated: ${summary.wikiRevisionAttributionsCreated}`);
    logger.log(`verificationsOfficialCreated:    ${summary.verificationsOfficialCreated}`);
    logger.log(`verificationsAlreadyOfficial:    ${summary.verificationsAlreadyOfficial}`);
    logger.log(`durationMs:                      ${summary.durationMs}`);

    if (summary.errors > 0) {
      logger.error(`Backfill finished with ${summary.errors} row-level error(s):`);
      for (const r of summary.results) {
        if (r.outcome === 'error') {
          logger.error(`  ${r.slug}: ${r.error}`);
        }
      }
      process.exitCode = 1;
    }
    if (summary.notFound > 0) {
      logger.warn(`${summary.notFound} slug(s) in the manifest were not found in the database:`);
      for (const r of summary.results) {
        if (r.outcome === 'not_found') {
          logger.warn(`  ${r.slug}`);
        }
      }
    }
  } finally {
    await app.close();
  }
}

// `require.main === module` — cùng lý do `expire-overdue-verifications.ts`: chỉ chạy `main()` khi
// file này được thực thi TRỰC TIẾP, không khi bị `import` bởi test.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger đã đóng ở nhánh này
    console.error('Administrative data backfill failed:', err);
    process.exit(1);
  });
}
