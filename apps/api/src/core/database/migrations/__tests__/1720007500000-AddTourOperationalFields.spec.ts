import { AddTourOperationalFields1720007500000 } from '../1720007500000-AddTourOperationalFields';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddTourOperationalFields migration (điểm đón/bao gồm/hủy, 2026-09-29)', () => {
  it('up: adds pickup_point, inclusions, exclusions, cancellation_policy to place_tour_details', async () => {
    const { qr, calls } = recordingRunner();
    await new AddTourOperationalFields1720007500000().up(qr);

    const sqls = calls.map((c) => c.sql);
    const alter = sqls.find((s) => s.includes('ALTER TABLE "place_tour_details"'));
    expect(alter).toBeDefined();
    expect(alter).toContain('ADD COLUMN "pickup_point" varchar(300)');
    expect(alter).toContain('ADD COLUMN "inclusions" text');
    expect(alter).toContain('ADD COLUMN "exclusions" text');
    expect(alter).toContain('ADD COLUMN "cancellation_policy" text');
  });

  it('down: drops all four columns', async () => {
    const { qr, calls } = recordingRunner();
    await new AddTourOperationalFields1720007500000().down(qr);

    const sqls = calls.map((c) => c.sql);
    for (const col of ['cancellation_policy', 'exclusions', 'inclusions', 'pickup_point']) {
      expect(sqls.some((s) => s.includes(`DROP COLUMN IF EXISTS "${col}"`))).toBe(true);
    }
  });
});
