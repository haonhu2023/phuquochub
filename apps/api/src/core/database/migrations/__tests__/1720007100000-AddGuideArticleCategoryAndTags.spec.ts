import { AddGuideArticleCategoryAndTags1720007100000 } from '../1720007100000-AddGuideArticleCategoryAndTags';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddGuideArticleCategoryAndTags migration (chuyên mục/tags cẩm nang, 2026-09-29)', () => {
  it('up: creates the category enum, both columns (category nullable, tags NOT NULL default \'{}\'), and both indexes', async () => {
    const { qr, calls } = recordingRunner();
    await new AddGuideArticleCategoryAndTags1720007100000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('CREATE TYPE "guide_article_category" AS ENUM'))).toBe(true);
    expect(sqls.some((s) => s.includes('ADD COLUMN "category" "guide_article_category"'))).toBe(true);
    expect(sqls.some((s) => s.includes('ADD COLUMN "tags" text[] NOT NULL DEFAULT'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_guide_articles_category') && s.includes("WHERE \"status\" = 'published'"))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_guide_articles_tags') && s.includes('USING GIN'))).toBe(true);
  });

  it('down: drops both indexes, both columns, and the enum type, in a safe order', async () => {
    const { qr, calls } = recordingRunner();
    await new AddGuideArticleCategoryAndTags1720007100000().down(qr);

    const sqls = calls.map((c) => c.sql);
    const dropTagsIdx = sqls.findIndex((s) => s.includes('DROP INDEX IF EXISTS "idx_guide_articles_tags"'));
    const dropCategoryIdx = sqls.findIndex((s) => s.includes('DROP INDEX IF EXISTS "idx_guide_articles_category"'));
    const dropTagsCol = sqls.findIndex((s) => s.includes('DROP COLUMN IF EXISTS "tags"'));
    const dropCategoryCol = sqls.findIndex((s) => s.includes('DROP COLUMN IF EXISTS "category"'));
    const dropType = sqls.findIndex((s) => s.includes('DROP TYPE IF EXISTS "guide_article_category"'));

    expect(dropTagsIdx).toBeGreaterThanOrEqual(0);
    expect(dropCategoryIdx).toBeGreaterThanOrEqual(0);
    // Indexes must be dropped before the columns/type they depend on.
    expect(dropTagsCol).toBeGreaterThan(dropTagsIdx);
    expect(dropCategoryCol).toBeGreaterThan(dropCategoryIdx);
    expect(dropType).toBeGreaterThan(dropCategoryCol);
  });
});
