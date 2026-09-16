import { SeedContentOwnerModerationPermissions1720005800000 } from '../1720005800000-SeedContentOwnerModerationPermissions';
import type { QueryRunner } from 'typeorm';
import { grantSatisfies } from '../../../../modules/authz/authorization.util';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedContentOwnerModerationPermissions migration', () => {
  it('up: thêm đúng MỘT permission Media.Moderate.Own (module=Media, action=Moderate, scope=Own)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerModerationPermissions1720005800000().up(qr);

    const insertPerm = calls[0].sql;
    expect(insertPerm).toContain("'Media.Moderate.Own','Media','Moderate','Own'");
    expect(insertPerm).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "permissions"'))).toHaveLength(1);
  });

  it('up: cấp Media.Moderate.Own cho ĐÚNG content_owner', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerModerationPermissions1720005800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls[0].params).toEqual(['content_owner', ['Media.Moderate.Own']]);
  });

  it('up: cấp PlaceTranslation.Review.Any cho content_owner KHÔNG re-insert permission đó (đã tồn tại từ trước)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerModerationPermissions1720005800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls[1].params).toEqual(['content_owner', ['PlaceTranslation.Review.Any']]);
    const insertPermCalls = calls.filter((c) => c.sql.includes('INSERT INTO "permissions"'));
    const allInsertedPerms = insertPermCalls.map((c) => c.sql).join('\n');
    expect(allInsertedPerms).not.toContain('PlaceTranslation.Review.Any');
  });

  it('up: chỉ cấp cho content_owner, không role nào khác', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerModerationPermissions1720005800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const roles = grantCalls.map((c) => (c.params as unknown[])[0]);
    expect(roles.every((r) => r === 'content_owner')).toBe(true);
  });

  it('down: gỡ đúng grant PlaceTranslation.Review.Any của content_owner (không đụng grant của moderator) rồi xoá permission Media.Moderate.Own', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerModerationPermissions1720005800000().down(qr);

    expect(calls[0].sql).toContain('DELETE FROM "role_permissions"');
    expect(calls[0].sql).toContain("code = 'content_owner'");
    expect(calls[0].sql).toContain("code = 'PlaceTranslation.Review.Any'");
    expect(calls[1].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Media.Moderate.Own'`);
  });

  describe('bậc scope — VÌ SAO moderation.service.ts không được kiểm tra Media.Moderate.Own qua authz.can()', () => {
    it('moderator giữ Media.Moderate (không hậu tố) SẼ rank-thoả mãn Media.Moderate.Own qua grantSatisfies — đây CHÍNH LÀ cái bẫy phải tránh', () => {
      expect(grantSatisfies('Media.Moderate', 'Media.Moderate.Own')).toBe(true);
    });

    it('wildcard toàn cục "*" cũng rank-thoả mãn Media.Moderate.Own', () => {
      expect(grantSatisfies('*', 'Media.Moderate.Own')).toBe(true);
    });
  });
});
