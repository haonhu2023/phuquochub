import { SeedJobListingPermissions1720008200000 } from '../1720008200000-SeedJobListingPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedJobListingPermissions migration', () => {
  it('up: insert đúng 2 permission ("module", không phải "resource" — khớp schema permissions thật) + cấp member/moderator/content_owner', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedJobListingPermissions1720008200000().up(qr);

    expect(calls).toHaveLength(4);
    expect(calls[0].sql).toContain('INSERT INTO "permissions" ("code","module","action","scope")');
    expect(calls[0].sql).toContain("'JobListing.Create'");
    expect(calls[0].sql).toContain("'JobListing.Moderate'");

    expect(calls[1].params).toEqual(['member', ['JobListing.Create']]);
    expect(calls[2].params).toEqual(['moderator', ['JobListing.Moderate']]);
    // content_owner cấp TRỰC TIẾP trong CHÍNH migration này — khác place_edit_proposals (phải vá
    // sau bằng GrantContentOwnerPlaceEditProposalModeration).
    expect(calls[3].params).toEqual(['content_owner', ['JobListing.Moderate']]);
    for (const c of [calls[1], calls[2], calls[3]]) {
      expect(c.sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    }
  });

  it('down: chỉ xoá 2 permission theo code, cascade role_permissions tự dọn (không DELETE role_permissions trực tiếp)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedJobListingPermissions1720008200000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "permissions"');
    expect(calls[0].sql).toContain('JobListing.Create');
    expect(calls[0].sql).toContain('JobListing.Moderate');
  });
});
