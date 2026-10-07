import { SeedRealEstateListingPermissions1720008400000 } from '../1720008400000-SeedRealEstateListingPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedRealEstateListingPermissions migration', () => {
  it('up: insert đúng 2 permission ("module", khớp schema permissions thật) + cấp member/moderator/content_owner', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedRealEstateListingPermissions1720008400000().up(qr);

    expect(calls).toHaveLength(4);
    expect(calls[0].sql).toContain('INSERT INTO "permissions" ("code","module","action","scope")');
    expect(calls[0].sql).toContain("'RealEstateListing.Create'");
    expect(calls[0].sql).toContain("'RealEstateListing.Moderate'");

    expect(calls[1].params).toEqual(['member', ['RealEstateListing.Create']]);
    expect(calls[2].params).toEqual(['moderator', ['RealEstateListing.Moderate']]);
    // content_owner cấp TRỰC TIẾP trong CHÍNH migration này — tránh lặp lại bug class
    // place_edit_proposals từng gặp (phải vá sau bằng một migration riêng).
    expect(calls[3].params).toEqual(['content_owner', ['RealEstateListing.Moderate']]);
  });

  it('down: chỉ xoá 2 permission theo code, cascade role_permissions tự dọn', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedRealEstateListingPermissions1720008400000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "permissions"');
    expect(calls[0].sql).toContain('RealEstateListing.Create');
    expect(calls[0].sql).toContain('RealEstateListing.Moderate');
  });
});
