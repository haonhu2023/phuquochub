import { PlaceEditSuggestions1720006600000 } from '../1720006600000-PlaceEditSuggestions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('PlaceEditSuggestions migration (Ưu tiên 3, 2026-09-24)', () => {
  it('up: tạo bảng place_edit_suggestions + 2 index, KHÔNG seed permission nào', async () => {
    const { qr, calls } = recordingRunner();
    await new PlaceEditSuggestions1720006600000().up(qr);

    expect(calls).toHaveLength(4);
    expect(calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS "place_edit_suggestions"');
    expect(calls[0].sql).toContain('REFERENCES "places"("id") ON DELETE CASCADE');
    expect(calls[0].sql).toContain('"status"          varchar(20) NOT NULL DEFAULT \'pending\'');
    expect(calls[1].sql).toContain('COMMENT ON TABLE "place_edit_suggestions"');
    expect(calls[2].sql).toContain('idx_place_suggestions_place_pending');
    expect(calls[3].sql).toContain('idx_place_suggestions_status');
    expect(calls.some((c) => c.sql.includes('INSERT INTO "permissions"'))).toBe(false);
  });

  it('down: xoá bảng, không còn thao tác nào khác', async () => {
    const { qr, calls } = recordingRunner();
    await new PlaceEditSuggestions1720006600000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DROP TABLE IF EXISTS "place_edit_suggestions"');
  });
});
