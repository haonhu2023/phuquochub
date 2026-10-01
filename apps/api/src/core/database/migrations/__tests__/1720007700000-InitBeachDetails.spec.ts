import { InitBeachDetails1720007700000 } from '../1720007700000-InitBeachDetails';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('InitBeachDetails migration (bảng vệ tinh place_beach_details, 2026-09-29)', () => {
  it('up: creates place_beach_details with all 6 content columns and 3 source-pairing triples', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBeachDetails1720007700000().up(qr);

    const sqls = calls.map((c) => c.sql);
    const create = sqls.find((s) => s.includes('CREATE TABLE "place_beach_details"'));
    expect(create).toBeDefined();
    expect(create).toContain('"place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE');
    expect(create).toContain('"access_route" text');
    expect(create).toContain('"characteristics" text');
    expect(create).toContain('"services" text');
    for (const field of ['best_season', 'lifeguard_info', 'sourced_notes']) {
      expect(create).toContain(`"${field}" text`);
      expect(create).toContain(`"${field}_source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL`);
      expect(create).toContain(`"${field}_verified_at" timestamptz`);
    }
  });

  it('down: drops the table', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBeachDetails1720007700000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP TABLE IF EXISTS "place_beach_details"'))).toBe(true);
  });
});
