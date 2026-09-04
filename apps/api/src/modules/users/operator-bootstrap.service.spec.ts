import {
  BOOTSTRAPPABLE_ROLE_CODES,
  DEFAULT_BOOTSTRAP_ROLE,
  OperatorBootstrapError,
  OperatorBootstrapService,
} from './operator-bootstrap.service';
import { ScopeType } from '../rbac/rbac.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import type { UsersRepository } from './repositories/users.repository';
import type { RolesRepository } from '../rbac/repositories/roles.repository';
import type { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import type { AuditService } from '../../core/audit/audit.service';

// Operator Bootstrap (2026-08-12) — lối thoát DUY NHẤT khỏi thế bí RBAC trên CSDL mới. Đây là code
// cấp quyền chạy ngoài mọi guard HTTP, nên bề mặt tấn công của nó là chính các tham số đầu vào:
// email nào, vai trò nào, và chuyện gì xảy ra khi chạy lại. Mỗi test dưới đây khoá đúng một trong
// những câu hỏi đó.
describe('OperatorBootstrapService', () => {
  const USER = { id: 'user-1', email: 'operator@example.test', isActive: true, isServiceAccount: false };
  const ROLE = { id: 'role-admin', code: 'administrator' };

  let usersRepo: LooseMock<UsersRepository>;
  let rolesRepo: LooseMock<RolesRepository>;
  let userRolesRepo: LooseMock<UserRolesRepository>;
  let audit: LooseMock<AuditService>;
  let sut: OperatorBootstrapService;

  beforeEach(() => {
    usersRepo = createMock<UsersRepository>({ findByEmail: jest.fn().mockResolvedValue(USER) });
    rolesRepo = createMock<RolesRepository>({ findByCode: jest.fn().mockResolvedValue(ROLE) });
    userRolesRepo = createMock<UserRolesRepository>({
      findActive: jest.fn().mockResolvedValue(null),
      assign: jest.fn().mockResolvedValue({ id: 'ur-1' }),
    });
    audit = createMock<AuditService>({ record: jest.fn() });
    sut = new OperatorBootstrapService(usersRepo, rolesRepo, userRolesRepo, audit);
  });

  describe('cấp vai trò', () => {
    it('cấp vai trò global cho người dùng đã tồn tại và ghi audit', async () => {
      const res = await sut.bootstrap({ email: USER.email });

      expect(res).toEqual({
        userId: USER.id,
        email: USER.email,
        roleCode: 'administrator',
        outcome: 'granted',
      });
      expect(userRolesRepo.assign).toHaveBeenCalledWith({
        userId: USER.id,
        roleId: ROLE.id,
        scopeType: ScopeType.GLOBAL,
        // KHÔNG mượn danh người được cấp làm grantedBy — vết audit không được nói dối rằng
        // người đó tự cấp quyền cho chính mình.
        grantedBy: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'role.assigned',
          entityType: 'user',
          entityId: USER.id,
          actorId: null,
          context: { source: 'operator-bootstrap-script' },
        }),
      );
    });

    it('mặc định là administrator — vai trò đặc quyền NHỎ NHẤT phá được thế bí (có Role.Assign)', async () => {
      await sut.bootstrap({ email: USER.email });
      expect(rolesRepo.findByCode).toHaveBeenCalledWith(DEFAULT_BOOTSTRAP_ROLE);
      expect(DEFAULT_BOOTSTRAP_ROLE).toBe('administrator');
    });

    it('chuẩn hoá email (trim + lowercase) trước khi tra cứu', async () => {
      await sut.bootstrap({ email: '  OPERATOR@Example.TEST  ' });
      expect(usersRepo.findByEmail).toHaveBeenCalledWith('operator@example.test');
    });
  });

  // Chạy lại là chuyện BÌNH THƯỜNG trong một runbook (thử lại sau lỗi mạng, chạy lại cả script
  // triển khai) — không được tạo dòng user_roles thứ hai, không được ghi audit lần hai.
  describe('idempotency', () => {
    it('vai trò đã được cấp -> KHÔNG assign lại, KHÔNG ghi audit, báo already_assigned', async () => {
      userRolesRepo.findActive.mockResolvedValue({ id: 'ur-existing' });

      const res = await sut.bootstrap({ email: USER.email });

      expect(res.outcome).toBe('already_assigned');
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('kiểm tra trùng theo (user, role, business=null) — đúng chiều global, không phải managed', async () => {
      await sut.bootstrap({ email: USER.email });
      expect(userRolesRepo.findActive).toHaveBeenCalledWith(USER.id, ROLE.id, null);
    });
  });

  describe('từ chối rõ ràng thay vì làm bừa', () => {
    it('thiếu email -> lỗi hướng dẫn, KHÔNG tra cứu gì', async () => {
      await expect(sut.bootstrap({ email: '' })).rejects.toBeInstanceOf(OperatorBootstrapError);
      expect(usersRepo.findByEmail).not.toHaveBeenCalled();
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });

    it('người dùng không tồn tại -> lỗi, KHÔNG tạo người dùng, KHÔNG cấp gì', async () => {
      usersRepo.findByEmail.mockResolvedValue(null);

      await expect(sut.bootstrap({ email: 'khong-ton-tai@example.test' })).rejects.toThrow(
        /Không tìm thấy người dùng/,
      );
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    // human-translation-review, 2026-09-04: bootstrap là code cấp quyền NGOÀI mọi guard HTTP — hai
    // test dưới đây khoá đúng bề mặt "email nào" không được phép biến thành một cấp quyền, dù
    // hợp lệ theo mọi điều kiện khác (email tồn tại, vai trò hợp lệ, chưa từng được cấp).
    it('tài khoản dịch vụ (is_service_account=true) -> từ chối, KHÔNG cấp gì', async () => {
      usersRepo.findByEmail.mockResolvedValue({ ...USER, isServiceAccount: true, isActive: true });

      await expect(sut.bootstrap({ email: USER.email })).rejects.toThrow(/tài khoản dịch vụ/);
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('tài khoản không hoạt động (is_active=false) -> từ chối, KHÔNG cấp gì', async () => {
      usersRepo.findByEmail.mockResolvedValue({ ...USER, isServiceAccount: false, isActive: false });

      await expect(sut.bootstrap({ email: USER.email })).rejects.toThrow(/không hoạt động/);
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('vai trò không tồn tại trong CSDL -> lỗi nhắc SeedRbac, KHÔNG cấp gì', async () => {
      rolesRepo.findByCode.mockResolvedValue(null);

      await expect(sut.bootstrap({ email: USER.email })).rejects.toThrow(/SeedRbac/);
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });
  });

  // Bề mặt leo thang đặc quyền nguy hiểm nhất của script này: một biến môi trường gõ sai (hoặc cố
  // ý) biến lệnh bootstrap thành lệnh cấp quyền tuyệt đối.
  describe('allowlist vai trò — chặn leo thang đặc quyền', () => {
    it('super_administrator BỊ TỪ CHỐI (permission `*` không bao giờ cấp từ shell)', async () => {
      await expect(
        sut.bootstrap({ email: USER.email, roleCode: 'super_administrator' }),
      ).rejects.toThrow(/super_administrator/);
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      // Không được tra cứu vai trò: chặn ở allowlist TRƯỚC khi chạm CSDL.
      expect(rolesRepo.findByCode).not.toHaveBeenCalled();
    });

    it.each(['member', 'business_owner', 'guest', 'ai_agent', 'khong-co-that'])(
      'vai trò "%s" ngoài allowlist -> từ chối, KHÔNG cấp gì',
      async (roleCode) => {
        await expect(sut.bootstrap({ email: USER.email, roleCode })).rejects.toBeInstanceOf(
          OperatorBootstrapError,
        );
        expect(userRolesRepo.assign).not.toHaveBeenCalled();
      },
    );

    it.each([...BOOTSTRAPPABLE_ROLE_CODES])('vai trò "%s" được phép bootstrap', async (roleCode) => {
      rolesRepo.findByCode.mockResolvedValue({ id: `role-${roleCode}`, code: roleCode });

      const res = await sut.bootstrap({ email: USER.email, roleCode });

      expect(res.outcome).toBe('granted');
      expect(res.roleCode).toBe(roleCode);
    });

    it('allowlist KHÔNG chứa super_administrator (khoá lại chính danh sách, không chỉ hành vi)', () => {
      expect(BOOTSTRAPPABLE_ROLE_CODES).not.toContain('super_administrator');
      expect(BOOTSTRAPPABLE_ROLE_CODES).toEqual(['administrator', 'moderator', 'contributor']);
    });
  });
});
