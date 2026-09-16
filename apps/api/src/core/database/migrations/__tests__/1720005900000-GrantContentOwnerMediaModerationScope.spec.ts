import { GrantContentOwnerMediaModerationScope1720005900000 } from '../1720005900000-GrantContentOwnerMediaModerationScope';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('GrantContentOwnerMediaModerationScope migration', () => {
  it('up: cấp ĐÚNG Media.Moderate + Moderation.Queue.View cho content_owner, không insert permission mới nào', async () => {
    const { qr, calls } = recordingRunner();
    await new GrantContentOwnerMediaModerationScope1720005900000().up(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO "role_permissions"');
    expect(calls[0].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(calls[0].params).toEqual(['content_owner', ['Media.Moderate', 'Moderation.Queue.View']]);
  });

  // Không cấp Review.Moderate hay Place.Approve — phạm vi cố ý giới hạn ở kiểm duyệt ẢNH, xem
  // ghi chú đầy đủ tại migration.
  it('up: KHÔNG cấp Review.Moderate hay Place.Approve', async () => {
    const { qr, calls } = recordingRunner();
    await new GrantContentOwnerMediaModerationScope1720005900000().up(qr);

    const grantedCodes = calls[0].params as [string, string[]];
    expect(grantedCodes[1]).not.toContain('Review.Moderate');
    expect(grantedCodes[1]).not.toContain('Place.Approve');
  });

  it('down: gỡ đúng hai grant của content_owner, không xoá permission nào (permission có sẵn từ trước, moderator vẫn giữ)', async () => {
    const { qr, calls } = recordingRunner();
    await new GrantContentOwnerMediaModerationScope1720005900000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM "role_permissions"');
    expect(calls[0].sql).toContain("code = 'content_owner'");
    expect(calls[0].sql).not.toContain('DELETE FROM "permissions"');
    expect(calls[0].params).toEqual([['Media.Moderate', 'Moderation.Queue.View']]);
  });
});
