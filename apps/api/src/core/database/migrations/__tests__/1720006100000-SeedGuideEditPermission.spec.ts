import { SeedGuideEditPermission1720006100000 } from '../1720006100000-SeedGuideEditPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedGuideEditPermission migration (Guide CMS candidate, 2026-09-18)', () => {
  it('up: inserts Guide.Edit.Any and grants it to moderator, both idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedGuideEditPermission1720006100000().up(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(`'Guide.Edit.Any','Guide','Edit','Any'`);
    expect(calls[0].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls[1].sql).toContain(`p.code = 'Guide.Edit.Any'`);
    expect(calls[1].sql).toContain(`r.code = 'moderator'`);
    expect(calls[1].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
  });

  it('down: deletes only the Guide.Edit.Any permission row', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedGuideEditPermission1720006100000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Guide.Edit.Any'`);
  });
});
