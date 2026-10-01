import { AddRestaurantMenuItemSignature1720007400000 } from '../1720007400000-AddRestaurantMenuItemSignature';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddRestaurantMenuItemSignature migration (món nổi bật, 2026-09-29)', () => {
  it('up: adds is_signature boolean NOT NULL DEFAULT false', async () => {
    const { qr, calls } = recordingRunner();
    await new AddRestaurantMenuItemSignature1720007400000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(
      sqls.some(
        (s) =>
          s.includes('ALTER TABLE "restaurant_menu_items"') &&
          s.includes('ADD COLUMN "is_signature" boolean NOT NULL DEFAULT false'),
      ),
    ).toBe(true);
  });

  it('down: drops the column', async () => {
    const { qr, calls } = recordingRunner();
    await new AddRestaurantMenuItemSignature1720007400000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "is_signature"'))).toBe(true);
  });
});
