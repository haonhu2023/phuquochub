import { SeedPlaceExternalIdentifierVerifyPermission1720009100000 } from '../1720009100000-SeedPlaceExternalIdentifierVerifyPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedPlaceExternalIdentifierVerifyPermission migration (confirm/revoke ownership, 2026-10-16)', () => {
  it('up: inserts PlaceExternalIdentifier.Verify and grants it to content_owner, both idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceExternalIdentifierVerifyPermission1720009100000().up(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(`'PlaceExternalIdentifier.Verify','PlaceExternalIdentifier','Verify','Any'`);
    expect(calls[0].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls[1].sql).toContain(`p.code = 'PlaceExternalIdentifier.Verify'`);
    expect(calls[1].sql).toContain(`r.code = 'content_owner'`);
    expect(calls[1].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
  });

  it('down: deletes only the PlaceExternalIdentifier.Verify permission row', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceExternalIdentifierVerifyPermission1720009100000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'PlaceExternalIdentifier.Verify'`);
  });
});
