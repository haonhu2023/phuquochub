import { SeedContentOwnerRole1720006200000 } from '../1720006200000-SeedContentOwnerRole';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedContentOwnerRole migration (launch-readiness, 2026-09-22)', () => {
  it('up: inserts the content_owner role, then grants exactly the ten content permissions — idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720006200000().up(qr);

    expect(calls).toHaveLength(2);

    expect(calls[0].sql).toContain('INSERT INTO "roles"');
    expect(calls[0].sql).toContain("'content_owner'");
    expect(calls[0].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    // Never system/user/secret management — the boundary this role exists to respect.
    expect(calls[0].sql).not.toContain('Role.Assign');
    expect(calls[0].sql).not.toContain('Permission.Manage');

    expect(calls[1].sql).toContain('INSERT INTO "role_permissions"');
    expect(calls[1].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(calls[1].params?.[0]).toBe('content_owner');
    const grantedCodes = calls[1].params?.[1] as string[];
    expect(grantedCodes).toEqual([
      'Place.Create',
      'Place.Edit.Any',
      'Place.Approve',
      'Place.Archive',
      'Media.Upload.Managed',
      'Media.Moderate',
      'Contact.Edit.Managed',
      'Price.Edit.Managed',
      'Guide.Edit.Any',
      'PlaceTranslation.Review.Any',
    ]);
    expect(grantedCodes).not.toContain('Role.Assign');
    expect(grantedCodes).not.toContain('Permission.Manage');
    expect(grantedCodes).not.toContain('SiteContent.Edit'); // granted later, by SiteContentSchema
  });

  it('down: unconditionally deletes the role — role_permissions/user_roles cascade via FK', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720006200000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "roles" WHERE "code" = \'content_owner\'');
  });
});
