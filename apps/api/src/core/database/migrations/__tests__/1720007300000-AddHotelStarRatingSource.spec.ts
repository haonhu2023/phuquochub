import { AddHotelStarRatingSource1720007300000 } from '../1720007300000-AddHotelStarRatingSource';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddHotelStarRatingSource migration (hạng sao có nguồn, 2026-09-29)', () => {
  it('up: adds star_rating_source_id (FK sources) and star_rating_verified_at', async () => {
    const { qr, calls } = recordingRunner();
    await new AddHotelStarRatingSource1720007300000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(
      sqls.some(
        (s) =>
          s.includes('ALTER TABLE "place_hotel_details"') &&
          s.includes('ADD COLUMN "star_rating_source_id" uuid REFERENCES "sources"("id")') &&
          s.includes('ADD COLUMN "star_rating_verified_at" timestamptz'),
      ),
    ).toBe(true);
  });

  it('down: drops both columns', async () => {
    const { qr, calls } = recordingRunner();
    await new AddHotelStarRatingSource1720007300000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "star_rating_verified_at"'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "star_rating_source_id"'))).toBe(true);
  });
});
