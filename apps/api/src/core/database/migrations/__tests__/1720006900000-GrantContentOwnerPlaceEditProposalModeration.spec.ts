import { GrantContentOwnerPlaceEditProposalModeration1720006900000 } from '../1720006900000-GrantContentOwnerPlaceEditProposalModeration';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('GrantContentOwnerPlaceEditProposalModeration migration', () => {
  it('up: cấp ĐÚNG PlaceEditProposal.Moderate cho content_owner, không insert permission mới nào', async () => {
    const { qr, calls } = recordingRunner();
    await new GrantContentOwnerPlaceEditProposalModeration1720006900000().up(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO "role_permissions"');
    expect(calls[0].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(calls[0].params).toEqual(['content_owner', ['PlaceEditProposal.Moderate']]);
  });

  it('down: gỡ đúng grant của content_owner, không xoá permission nào (moderator vẫn giữ)', async () => {
    const { qr, calls } = recordingRunner();
    await new GrantContentOwnerPlaceEditProposalModeration1720006900000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "role_permissions"');
    expect(calls[0].sql).toContain("code = 'content_owner'");
    expect(calls[0].sql).not.toContain('DELETE FROM "permissions"');
    expect(calls[0].params).toEqual([['PlaceEditProposal.Moderate']]);
  });
});
