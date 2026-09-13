import { SeedPlaceEditProposalPermissions1720005800000 } from '../1720005800000-SeedPlaceEditProposalPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedPlaceEditProposalPermissions migration', () => {
  it('up: thêm đúng 2 quyền, scope NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceEditProposalPermissions1720005800000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'PlaceEditProposal.Create','PlaceEditProposal','Create',NULL");
    expect(insertPerms).toContain("'PlaceEditProposal.Moderate','PlaceEditProposal','Moderate',NULL");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: member chỉ nhận PlaceEditProposal.Create (KHÔNG nhận .Moderate — không tự duyệt được)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceEditProposalPermissions1720005800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const memberGrant = grantCalls.find((c) => (c.params as unknown[])[0] === 'member')!;
    expect(memberGrant.params).toEqual(['member', ['PlaceEditProposal.Create']]);
  });

  it('up: moderator chỉ nhận PlaceEditProposal.Moderate (KHÔNG nhận .Create — staff không cần quyền "gửi" riêng)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceEditProposalPermissions1720005800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const moderatorGrant = grantCalls.find((c) => (c.params as unknown[])[0] === 'moderator')!;
    expect(moderatorGrant.params).toEqual(['moderator', ['PlaceEditProposal.Moderate']]);
  });

  it('down: xoá đúng 2 quyền theo code', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceEditProposalPermissions1720005800000().down(qr);

    expect(calls[0].sql).toContain("'PlaceEditProposal.Create','PlaceEditProposal.Moderate'");
  });
});
