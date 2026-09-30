import { AddAttractionFields1720007600000 } from '../1720007600000-AddAttractionFields';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddAttractionFields migration (thời lượng tham quan/quy định, 2026-09-29)', () => {
  it('up: adds visit_duration_minutes and rules to places', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAttractionFields1720007600000().up(qr);

    const sqls = calls.map((c) => c.sql);
    const alter = sqls.find((s) => s.includes('ALTER TABLE "places"'));
    expect(alter).toBeDefined();
    expect(alter).toContain('ADD COLUMN "visit_duration_minutes" int');
    expect(alter).toContain('ADD COLUMN "rules" text');
  });

  it('down: drops both columns', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAttractionFields1720007600000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "rules"'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "visit_duration_minutes"'))).toBe(true);
  });
});
