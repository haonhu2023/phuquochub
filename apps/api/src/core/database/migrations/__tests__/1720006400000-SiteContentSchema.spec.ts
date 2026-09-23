import { SiteContentSchema1720006400000 } from '../1720006400000-SiteContentSchema';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SiteContentSchema migration (S1, launch-readiness pass 2026-09-22)', () => {
  it('up: creates site_content table, seeds SiteContent.Edit, grants it to content_owner', async () => {
    const { qr, calls } = recordingRunner();
    await new SiteContentSchema1720006400000().up(qr);

    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS "site_content"');
    expect(calls[0].sql).toContain('PRIMARY KEY ("key", "locale")');
    expect(calls[1].sql).toContain(`'SiteContent.Edit','SiteContent','Edit','Any'`);
    expect(calls[1].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls[2].sql).toContain(`p.code = 'SiteContent.Edit'`);
    expect(calls[2].sql).toContain(`r.code = 'content_owner'`);
    expect(calls[2].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
  });

  it('down: deletes the permission row then drops the table', async () => {
    const { qr, calls } = recordingRunner();
    await new SiteContentSchema1720006400000().down(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'SiteContent.Edit'`);
    expect(calls[1].sql).toContain('DROP TABLE IF EXISTS "site_content"');
  });
});
