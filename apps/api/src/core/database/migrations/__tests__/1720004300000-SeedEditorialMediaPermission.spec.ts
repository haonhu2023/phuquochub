import { SeedEditorialMediaPermission1720004300000 } from '../1720004300000-SeedEditorialMediaPermission';
import type { QueryRunner } from 'typeorm';
import { grantSatisfies } from '../../../../modules/authz/authorization.util';
import { grantScopeOf } from '../../../../modules/authz/scoped-authorization.util';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

// Operator Bootstrap & Editorial Place Content (2026-08-12). Migration này CẤP QUYỀN, nên test
// không chỉ kiểm tra SQL: nó khoá lại CẢ hai tính chất an toàn mà thiết kế dựa vào —
// (1) `Media.Upload.Any` thoả mãn `Media.Upload.Managed` qua bậc scope sẵn có, nên KHÔNG cần sửa
//     guard/controller nào;
// (2) quyền chỉ cấp cho ĐÚNG một vai trò (`contributor`), không rải rác.
describe('SeedEditorialMediaPermission migration (Editorial Place Content)', () => {
  it('up: thêm đúng MỘT permission Media.Upload.Any (module=Media, action=Upload, scope=Any)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedEditorialMediaPermission1720004300000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'Media.Upload.Any','Media','Upload','Any'");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "permissions"'))).toHaveLength(1);
  });

  it('up: cấp cho ĐÚNG vai trò `contributor`, không cấp cho vai trò nào khác', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedEditorialMediaPermission1720004300000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    expect(grantCalls[0].params).toEqual(['contributor', ['Media.Upload.Any']]);
  });

  it('up: KHÔNG đụng tới bảng nào ngoài permissions/role_permissions (không sửa user_roles, không gán người thật)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedEditorialMediaPermission1720004300000().up(qr);

    const all = calls.map((c) => c.sql).join('\n');
    expect(all).not.toMatch(/user_roles/i);
    expect(all).not.toMatch(/UPDATE|DELETE/i);
  });

  it('down: gỡ đúng permission đó (role_permissions theo sau qua FK CASCADE)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedEditorialMediaPermission1720004300000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Media.Upload.Any'`);
  });

  // LÝ DO thiết kế này không cần sửa một dòng guard/controller nào. Nếu ai đó đổi SCOPE_RANK hoặc
  // `grantSatisfies`, test này vỡ NGAY — thay vì âm thầm biến toàn bộ năng lực biên tập thành 403.
  describe('bậc scope — vì sao không cần sửa controller', () => {
    it('Media.Upload.Any thoả mãn Media.Upload.Managed mà place-media.controller.ts yêu cầu', () => {
      expect(grantSatisfies('Media.Upload.Any', 'Media.Upload.Managed')).toBe(true);
    });

    it('Media.Upload.Any là grant CONTEXT-FREE — PDP không cần phân giải tư cách thành viên cơ sở', () => {
      expect(grantScopeOf('Media.Upload.Any')).toBe('any');
    });

    it('chiều ngược lại KHÔNG đúng: Managed/Own không tự nâng lên Any (không nới lỏng chủ cơ sở)', () => {
      expect(grantSatisfies('Media.Upload.Managed', 'Media.Upload.Any')).toBe(false);
      expect(grantSatisfies('Media.Upload.Own', 'Media.Upload.Managed')).toBe(false);
      expect(grantSatisfies('Media.Upload.Own', 'Media.Upload.Any')).toBe(false);
    });

    it('quyền member sẵn có KHÔNG chạm tới được năng lực biên tập', () => {
      // `Media.Upload.Own` là toàn bộ những gì `member` có cho media (SeedMediaPermissions).
      expect(grantSatisfies('Media.Upload.Own', 'Media.Upload.Managed')).toBe(false);
    });
  });
});
