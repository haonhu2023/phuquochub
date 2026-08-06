import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { VerificationsService, type VerificationExpirySummary } from '../modules/verifications/verifications.service';

// VERIFICATION SCHEDULER — Operational Enablement (2026-08-06, ADR-008). Standalone manual runner
// — no HTTP server started, no cron/schedule registered (calls `VerificationsService.
// expireOverdue()` DIRECTLY, bypassing `VerificationExpiryScheduler` entirely) — same
// `NestFactory.createApplicationContext()` pattern as `clean-orphan-media.ts` (first precedent in
// this repo for a CLI script that still needs full DI: TypeORM connection, ConfigService, etc.).
//
// Usage:
//   npm run verification:expire                              -- real run
//   npm run verification:expire -- --dry-run                  -- read-only: same batch query, zero writes
//   npm run verification:expire -- --batch-size=50
//   npm run verification:expire -- --max-batches=10
//   npm run verification:expire -- --max-execution-ms=60000
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSize = parseIntArg(args, '--batch-size');
  const maxBatches = parseIntArg(args, '--max-batches');
  const maxExecutionMs = parseIntArg(args, '--max-execution-ms');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const logger = new Logger('VerificationExpiryRunner');

  try {
    const service = app.get(VerificationsService);
    logger.log(`Starting verification expiry${dryRun ? ' (DRY RUN — no writes will be made)' : ''}...`);

    const summary = await service.expireOverdue({
      dryRun,
      ...(batchSize !== undefined ? { batchSize } : {}),
      ...(maxBatches !== undefined ? { maxBatches } : {}),
      ...(maxExecutionMs !== undefined ? { maxExecutionMs } : {}),
    });

    logger.log('--- Verification Expiry Summary ---');
    logger.log(`dryRun:              ${summary.dryRun}`);
    logger.log(`scanned:             ${summary.scanned}`);
    logger.log(`eligible:            ${summary.eligible}`);
    logger.log(`expired:             ${summary.expired}`);
    logger.log(`conflicts:           ${summary.conflicts}`);
    logger.log(`errors:              ${summary.errors}`);
    logger.log(`batchesRun:          ${summary.batchesRun}`);
    logger.log(`timeBudgetExceeded:  ${summary.timeBudgetExceeded}`);
    logger.log(`oldestProcessed:     ${summary.oldestProcessedExpiresAt?.toISOString() ?? 'n/a'}`);
    logger.log(`newestProcessed:     ${summary.newestProcessedExpiresAt?.toISOString() ?? 'n/a'}`);
    logger.log(`durationMs:          ${summary.durationMs}`);

    if (hasSystemicFailure(summary)) {
      logger.error(`Verification expiry finished with ${summary.errors} row-level error(s) — see logs above.`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

/**
 * Hệ thống: CHỈ `errors` (lỗi KHÔNG lường trước, vd sự cố kết nối giữa chừng) khiến runner thoát
 * mã khác 0 — `conflicts` là race BÌNH THƯỜNG (CAS thua/dòng vừa đổi trạng thái), KHÔNG phải triệu
 * chứng lỗi hệ thống, KHÔNG được coi là thất bại của lần chạy. Tách hàm THUẦN để unit test được
 * quyết định exit-code mà không cần bootstrap `NestFactory` thật.
 */
export function hasSystemicFailure(summary: Pick<VerificationExpirySummary, 'errors'>): boolean {
  return summary.errors > 0;
}

export function parseIntArg(args: string[], flag: string): number | undefined {
  const prefix = `${flag}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (!match) {
    return undefined;
  }
  const value = parseInt(match.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : undefined;
}

// `require.main === module` — chỉ chạy `main()` khi file này được thực thi TRỰC TIẾP (CLI thật,
// `ts-node src/scripts/...`), KHÔNG khi được `import` bởi unit test (spec file import
// `hasSystemicFailure`/`parseIntArg` mà không muốn kích hoạt `NestFactory.createApplicationContext`
// thật — cùng vấn đề `clean-orphan-media.ts` chưa gặp vì nó chưa từng bị import bởi test nào).
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger already closed on this path
    console.error('Verification expiry failed:', err);
    process.exit(1);
  });
}
