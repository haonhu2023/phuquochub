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
//
// PRODUCTION SAFETY (2026-08-18) — kiểm TRƯỚC KHI mở bất kỳ kết nối DB nào, không chỉ trước khi
// ghi: `assertNotProduction()` đọc đúng biến `env.validation.ts` đã dùng để phân biệt môi trường
// (`NODE_ENV`), cộng thêm dò chuỗi "prod" trong DATABASE_URL/DB_HOST/DB_NAME làm lớp phòng vệ thứ
// hai (một `.env` sao chép nhầm từ production nhưng quên đổi NODE_ENV vẫn phải bị chặn). KHÔNG có
// cờ bỏ qua — đúng yêu cầu "phát hiện dấu hiệu production thì ABORT, không hỏi lại rồi đoán".
export interface ProductionSafetyCheck {
  isSafe: boolean;
  reasons: string[];
}

export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): ProductionSafetyCheck {
  const reasons: string[] = [];
  if (env.NODE_ENV === 'production') {
    reasons.push(`NODE_ENV=production`);
  }
  const suspects: Array<[string, string | undefined]> = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['DB_HOST', env.DB_HOST],
    ['DB_NAME', env.DB_NAME],
  ];
  for (const [key, value] of suspects) {
    if (value && /prod/i.test(value)) {
      reasons.push(`${key} chứa chuỗi "prod": ${value}`);
    }
  }
  return { isSafe: reasons.length === 0, reasons };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const actorId = process.env.ADMIN_BACKFILL_ACTOR_ID ?? '';

  const logger = new Logger('AdministrativeBackfillRunner');

  const safety = assertNotProduction();
  if (!safety.isSafe) {
    logger.error('ABORT — môi trường có dấu hiệu production, script từ chối chạy:');
    for (const reason of safety.reasons) {
      logger.error(`  - ${reason}`);
    }
    logger.error('Không có cờ bỏ qua kiểm tra này. Chạy trên disposable/local DB, không phải production.');
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
