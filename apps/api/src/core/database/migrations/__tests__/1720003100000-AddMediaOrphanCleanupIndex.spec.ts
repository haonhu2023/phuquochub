import { AddMediaOrphanCleanupIndex1720003100000 } from '../1720003100000-AddMediaOrphanCleanupIndex';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string }> = [];
  const qr = {
    query: (sql: string) => {
      calls.push({ sql });
      return Promise.resolve(undefined);
    },
  } as unknown as QueryRunner;
  return { qr, calls };
}

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('AddMediaOrphanCleanupIndex migration (Media Orphan Cleanup)', () => {
  it('up: tạo partial index đúng 7 điều kiện đủ điều kiện dọn dẹp', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaOrphanCleanupIndex1720003100000().up(qr);
    const q = sql(calls[0].sql);
    expect(q).toContain('CREATE INDEX "idx_media_orphan_cleanup" ON "media" ("created_at")');
    expect(q).toContain(`"status" = 'pending'`);
    expect(q).toContain('"place_id" IS NULL');
    expect(q).toContain('"review_id" IS NULL');
    expect(q).toContain('"post_id" IS NULL');
    expect(q).toContain('"business_id" IS NULL');
    expect(q).toContain('"event_id" IS NULL');
    expect(q).toContain('"deleted_at" IS NULL');
  });

  it('down: chỉ DROP đúng index của chính nó, không đụng gì khác', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaOrphanCleanupIndex1720003100000().down(qr);
    expect(calls).toHaveLength(1);
    expect(sql(calls[0].sql)).toBe('DROP INDEX "idx_media_orphan_cleanup"');
  });
});
