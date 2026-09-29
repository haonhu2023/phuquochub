import { AddGuideArticleSeoFields1720007200000 } from '../1720007200000-AddGuideArticleSeoFields';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddGuideArticleSeoFields migration (SEO riêng cẩm nang, 2026-09-29)', () => {
  it('up: adds nullable meta_title (varchar 160) and meta_description (varchar 320)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddGuideArticleSeoFields1720007200000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('ADD COLUMN "meta_title" varchar(160)'))).toBe(true);
    expect(sqls.some((s) => s.includes('ADD COLUMN "meta_description" varchar(320)'))).toBe(true);
    // Nullable: no NOT NULL/DEFAULT clause on either column — pre-existing rows get NULL, not
    // a guessed value.
    expect(sqls.some((s) => s.includes('meta_title') && s.includes('NOT NULL'))).toBe(false);
    expect(sqls.some((s) => s.includes('meta_description') && s.includes('NOT NULL'))).toBe(false);
  });

  it('down: drops both columns', async () => {
    const { qr, calls } = recordingRunner();
    await new AddGuideArticleSeoFields1720007200000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "meta_description"'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "meta_title"'))).toBe(true);
  });
});
