import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { assertNotProduction } from './backfill-administrative-data';
import type { SourceFirstIngestService, IngestSummary } from '../modules/admin-data/source-first-ingest.service';
import type { CandidateInput } from '../modules/admin-data/source-first-publish-evaluator.service';
import { SourceType } from '../modules/sources/sources.enums';

// SOURCE-FIRST DRY-RUN — CLI runner (2026-10-24, rebuilt). Cùng khuôn `ingest-verified-facts.ts`/
// `backfill-administrative-data.ts`: `NestFactory.createApplicationContext()`, service qua DI,
// đóng app trong `finally`, `assertNotProduction()` IMPORT LẠI (không chép) vì cùng lý do nêu ở
// `ingest-verified-facts.ts`.
//
// `npm run admin:source-first-dry-run` đã trỏ tới file này từ commit 77a310c0 (2026-09-23) nhưng
// file thật chưa từng được commit — bản thân file này là file ĐẦU TIÊN tồn tại ở đường dẫn này.
//
// `SourceFirstIngestService.ingestCandidates()` không tự quét dữ liệu — nó chỉ XỬ LÝ một danh
// sách CandidateInput đã có observations với nguồn thật (sourceUrl/sourceType/retrievedAt). Danh
// sách dưới đây là ví dụ THẬT: địa điểm đã published trong DB, tra trực tiếp từ website chính thức
// của từng nơi hôm 2026-10-24 (không phải placeholder) — dùng để minh hoạ nhánh "enrich existing"
// (targetSlug khớp địa điểm đã có, điền các field còn NULL, bỏ qua field đã có giá trị vì pipeline
// chỉ ghi đè khi có evidence trail cũ yếu hơn evidence mới — xem buildEnrichDiffs()).
//
// CHỈ chạy dry-run (không ghi DB) — không cần ADMIN_BACKFILL_ACTOR_ID.
//
// Usage:
//   npm run admin:source-first-dry-run
function sampleCandidates(): CandidateInput[] {
  const now = new Date('2026-10-24T00:00:00.000Z');

  return [
    {
      candidateKey: 'enrich:sailing-club-phu-quoc:2026-10-24',
      targetSlug: 'sailing-club-phu-quoc',
      name: 'Sailing Club Phú Quốc',
      categorySlug: 'restaurant',
      address: 'Lô B7, Khu phức hợp Bãi Trường, Đặc khu Phú Quốc, tỉnh An Giang, Việt Nam',
      website: 'https://sailingclubphuquoc.com',
      phones: [{ value: '+84931031035', label: 'Hotline' }],
      observations: [
        {
          field: 'address',
          observedValue: 'Lô B7, Khu phức hợp Bãi Trường, Đặc khu Phú Quốc, tỉnh An Giang, Việt Nam',
          sourceType: SourceType.OFFICIAL_WEBSITE,
          sourceUrl: 'https://sailingclubphuquoc.com',
          publisher: 'Sailing Club Phú Quốc',
          retrievedAt: now,
          isPrimary: true,
        },
        {
          field: 'phone',
          observedValue: '+84931031035',
          sourceType: SourceType.OFFICIAL_WEBSITE,
          sourceUrl: 'https://sailingclubphuquoc.com',
          publisher: 'Sailing Club Phú Quốc',
          retrievedAt: now,
        },
        {
          field: 'website',
          observedValue: 'https://sailingclubphuquoc.com',
          sourceType: SourceType.OFFICIAL_WEBSITE,
          sourceUrl: 'https://sailingclubphuquoc.com',
          publisher: 'Sailing Club Phú Quốc',
          retrievedAt: now,
        },
      ],
    },
    {
      candidateKey: 'enrich:vinwonders-phu-quoc:2026-10-24',
      targetSlug: 'vinwonders-phu-quoc',
      name: 'VinWonders Phú Quốc',
      categorySlug: 'attraction',
      website: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
      phones: [{ value: '1900 6677', label: 'Hotline' }],
      observations: [
        {
          field: 'phone',
          observedValue: '1900 6677',
          sourceType: SourceType.OFFICIAL_WEBSITE,
          sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
          publisher: 'VinWonders',
          retrievedAt: now,
          isPrimary: true,
        },
        {
          field: 'website',
          observedValue: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
          sourceType: SourceType.OFFICIAL_WEBSITE,
          sourceUrl: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
          publisher: 'VinWonders',
          retrievedAt: now,
        },
      ],
    },
  ];
}

// CI IMPORT ISOLATION — xem giải thích đầy đủ ở `backfill-administrative-data.ts`: không import
// tĩnh `AppModule`/service ở đầu file, nạp động trong `main()` để spec chỉ test hàm thuần không
// kéo theo ConfigModule.forRoot() validation.
async function loadRuntime(): Promise<{
  AppModule: unknown;
  SourceFirstIngestService: new (...args: never[]) => SourceFirstIngestService;
}> {
  const [{ AppModule }, { SourceFirstIngestService }] = await Promise.all([
    import('../app.module'),
    import('../modules/admin-data/source-first-ingest.service'),
  ]);
  return { AppModule, SourceFirstIngestService };
}

async function main(): Promise<void> {
  const logger = new Logger('SourceFirstDryRunRunner');

  const safety = assertNotProduction();
  if (!safety.isSafe) {
    logger.error('ABORT — môi trường có dấu hiệu production, script từ chối chạy:');
    for (const reason of safety.reasons) logger.error(`  - ${reason}`);
    process.exitCode = 1;
    return;
  }

  const { AppModule, SourceFirstIngestService } = await loadRuntime();
  const app = await NestFactory.createApplicationContext(AppModule as never, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const service = app.get(SourceFirstIngestService);
    const candidates = sampleCandidates();
    logger.log(`Starting source-first dry-run (${candidates.length} candidate(s), NO writes)...`);

    const summary: IngestSummary = await service.ingestCandidates(candidates, {
      dryRun: true,
      actorId: '',
    });

    logger.log('--- Source-First Dry-Run Summary ---');
    logger.log(
      `total / published / held / enrichedExisting / skippedDuplicate / errors: ` +
        `${summary.total} / ${summary.published} / ${summary.held} / ${summary.enrichedExisting} / ` +
        `${summary.skippedDuplicate} / ${summary.errors}`,
    );

    for (const r of summary.results) {
      logger.log(`\n[${r.candidateKey}] ${r.name} → ${r.outcome}`);
      if (r.error) {
        logger.error(`  error: ${r.error}`);
        continue;
      }
      if (r.enrichResult) {
        logger.log(`  target: ${r.enrichResult.existingSlug} (${r.enrichResult.identityMethod})`);
        for (const d of r.enrichResult.fieldsToWrite) {
          logger.log(`  WOULD WRITE  ${d.field}: ${JSON.stringify(d.before)} → ${JSON.stringify(d.after)} [${d.action}] (${d.evidence.sourceUrl})`);
        }
        for (const d of r.enrichResult.fieldsSkipped) {
          logger.log(`  skip  ${d.field}: [${d.action}] current=${JSON.stringify(d.before)}`);
        }
        for (const n of r.enrichResult.auditNotes) {
          logger.log(`  note  ${n.field}: ${n.summary}`);
        }
      } else {
        if (r.autoPublishFields?.length) logger.log(`  would auto-publish fields: ${r.autoPublishFields.join(', ')}`);
        if (r.heldFields?.length) logger.log(`  held fields: ${r.heldFields.join(', ')}`);
        for (const hr of r.holdReasons ?? []) logger.warn(`  HOLD [${hr.type}] ${hr.field}: ${hr.summary}`);
      }
    }

    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger đã đóng ở nhánh này
    console.error('Source-first dry-run failed:', err);
    process.exit(1);
  });
}
