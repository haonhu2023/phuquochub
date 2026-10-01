import { SeedPriceVerifyPermission1720007800000 } from '../1720007800000-SeedPriceVerifyPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedPriceVerifyPermission migration (price verification ownership, 2026-10-01)', () => {
  it('up: inserts Price.Verify and grants it to content_owner, both idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPriceVerifyPermission1720007800000().up(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(`'Price.Verify','Price','Verify','Any'`);
    expect(calls[0].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls[1].sql).toContain(`p.code = 'Price.Verify'`);
    expect(calls[1].sql).toContain(`r.code = 'content_owner'`);
    expect(calls[1].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
  });

  it('down: deletes only the Price.Verify permission row', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPriceVerifyPermission1720007800000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Price.Verify'`);
  });
});
