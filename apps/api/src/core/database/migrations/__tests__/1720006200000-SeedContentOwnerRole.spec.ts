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

  it('down: only deletes the role/grants when it can prove this migration is the sole owner of the role\'s entire current state', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720006200000().down(qr);

    // A single DO block -- PostgreSQL DO statements do not accept bind parameters, so the 10
    // codes are inlined as a literal array (safe: `permissionCodes` is this class's own hardcoded
    // constant, never external input) rather than passed as a query param.
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toBeUndefined();

    const sql = calls[0].sql;
    expect(sql).toContain('DO $$');

    // Never an unconditional delete: production seeds this same role independently (with its own
    // grants, 2 of which overlap this migration's 10 codes) and assigns it to a real user before
    // this migration ever runs, so the role's current grant set is NEVER exactly these 10 codes in
    // practice -- the guard exists precisely so down() cannot tell "pre-existing, up() no-op'd on
    // it via ON CONFLICT DO NOTHING" apart from "up() actually inserted it", and must therefore
    // refuse to touch anything unless the WHOLE state is provably its own.
    expect(sql).toContain('granted_codes = (SELECT array_agg(c ORDER BY c) FROM unnest(expected_codes) c)');
    expect(sql).toContain('NOT has_assignment');
    expect(sql).toContain('DELETE FROM "role_permissions" WHERE "role_id" = target_role_id');
    expect(sql).toContain('DELETE FROM "roles" WHERE "id" = target_role_id');

    // The inlined literal carries exactly the ten codes up() grants -- nothing more, nothing less.
    expect(sql).toContain(
      "ARRAY['Place.Create','Place.Edit.Any','Place.Approve','Place.Archive','Media.Upload.Managed'," +
        "'Media.Moderate','Contact.Edit.Managed','Price.Edit.Managed','Guide.Edit.Any'," +
        "'PlaceTranslation.Review.Any']::text[]",
    );
  });
});
