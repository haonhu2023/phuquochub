import { GuideArticleSchema1720006000000 } from '../1720006000000-GuideArticleSchema';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('GuideArticleSchema migration (Guide CMS candidate, 2026-09-18)', () => {
  it('up: creates both enums, both tables, and both indexes, all idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new GuideArticleSchema1720006000000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('CREATE TYPE "guide_article_status"'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE TYPE "guide_block_type"'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "guide_articles"'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "guide_blocks"'))).toBe(true);
    expect(sqls.some((s) => s.includes('UNIQUE ("slug", "locale")'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_guide_articles_status'))).toBe(true);
    expect(sqls.some((s) => s.includes('idx_guide_blocks_article_position'))).toBe(true);
  });

  it('down: drops both tables (blocks before articles) and both types', async () => {
    const { qr, calls } = recordingRunner();
    await new GuideArticleSchema1720006000000().down(qr);

    const sqls = calls.map((c) => c.sql);
    const blocksDropIdx = sqls.findIndex((s) => s.includes('DROP TABLE IF EXISTS "guide_blocks"'));
    const articlesDropIdx = sqls.findIndex((s) => s.includes('DROP TABLE IF EXISTS "guide_articles"'));
    expect(blocksDropIdx).toBeGreaterThanOrEqual(0);
    expect(articlesDropIdx).toBeGreaterThan(blocksDropIdx);
    expect(sqls.some((s) => s.includes('DROP TYPE IF EXISTS "guide_block_type"'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP TYPE IF EXISTS "guide_article_status"'))).toBe(true);
  });
});
