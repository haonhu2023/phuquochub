import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';

// P0 ảnh cẩm nang (2026-09-29) — "Kiểm tra cách xử lý ảnh cẩm nang đã tồn tại nhưng chưa có case."
// Đây là ĐỌC-CHỈ, không sửa dữ liệu: liệt kê CHÍNH XÁC những guide_articles/guide_blocks đang tham
// chiếu một media mồ côi (place_id IS NULL, review_id IS NULL — cùng phạm vi
// GuideArticlesService.ensureModerationCasesForOwnPendingMedia áp cho lượt lưu MỚI), còn `pending`,
// và CHƯA có moderation_cases mở nào — tức là media được tạo TRƯỚC bản vá này (bản vá chỉ chạy khi
// createDraft/saveDraft được gọi lại, không hồi tố).
//
// KHÔNG có nhánh --apply. Theo đúng yêu cầu: không quét/cập nhật hàng loạt media mồ côi — nếu danh
// sách dưới đây khác rỗng, xử lý từng dòng một cách có chủ đích (hoặc chạy lại saveDraft() cho đúng
// bài viết đó, con đường đã có case-creation, thay vì viết thêm một đường ghi dữ liệu mới ở đây).
//
// Usage: npm run guide-media:missing-case-report  (chỉ trong apps/api)
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const logger = new Logger('GuideMediaMissingCaseReport');

  try {
    const dataSource = app.get(DataSource);

    const rows: Array<{
      article_id: string;
      slug: string;
      locale: string;
      article_status: string;
      location: string;
      media_id: string;
      media_status: string;
      uploaded_by: string | null;
      media_created_at: Date;
    }> = await dataSource.query(`
      WITH referenced_media AS (
        SELECT ga."id" AS article_id, ga."slug", ga."locale", ga."status" AS article_status,
               'hero' AS location, ga."hero_media_id" AS media_id
          FROM "guide_articles" ga
         WHERE ga."hero_media_id" IS NOT NULL
        UNION ALL
        SELECT gb."article_id", ga."slug", ga."locale", ga."status",
               'block:' || gb."id"::text AS location,
               CASE WHEN (gb."content" ->> 'mediaId') ~
                         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (gb."content" ->> 'mediaId')::uuid
               END AS media_id
          FROM "guide_blocks" gb
          JOIN "guide_articles" ga ON ga."id" = gb."article_id"
         WHERE gb."block_type" = 'image_with_rights'
      )
      SELECT rm.article_id, rm.slug, rm.locale, rm.article_status, rm.location,
             m."id" AS media_id, m."status" AS media_status, m."uploaded_by" AS uploaded_by,
             m."created_at" AS media_created_at
        FROM referenced_media rm
        JOIN "media" m ON m."id" = rm.media_id
       WHERE m."place_id" IS NULL
         AND m."review_id" IS NULL
         AND m."status" = 'pending'
         AND m."deleted_at" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "moderation_cases" mc
            WHERE mc."target_type" = 'media' AND mc."target_id" = m."id"
              AND mc."status" IN ('open','claimed')
         )
       ORDER BY rm.slug, rm.location
    `);

    logger.log(`Tổng số dòng (guide media mồ côi, pending, chưa có case mở): ${rows.length}`);
    for (const r of rows) {
      logger.log(
        `  article=${r.slug} (${r.locale}, ${r.article_status}) ${r.location} ` +
          `media=${r.media_id} uploadedBy=${r.uploaded_by ?? 'null'} createdAt=${new Date(r.media_created_at).toISOString()}`,
      );
    }
    if (rows.length === 0) {
      logger.log('Không có bản ghi nào — mọi ảnh cẩm nang mồ côi/pending hiện tại đều đã có case mở.');
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console -- app context/logger already closed on this path
    console.error('guide-media-missing-case-report failed:', err);
    process.exit(1);
  });
