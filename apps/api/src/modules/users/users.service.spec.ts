import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ScopeType } from '../rbac/rbac.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Logic hồ sơ + gán/thu hồi vai trò (api.md §10). Mock repository (new + mock).
describe('UsersService', () => {
  type Deps = ConstructorParameters<typeof UsersService>;
  let usersRepo: LooseMock<Deps[0]>;
  let rolesRepo: LooseMock<Deps[1]>;
  let userRolesRepo: LooseMock<Deps[2]>;
  let audit: LooseMock<Deps[3]>;
  let service: UsersService;

  beforeEach(() => {
    usersRepo = createMock<Deps[0]>({ findById: jest.fn(), save: jest.fn((u) => Promise.resolve(u)) });
    rolesRepo = createMock<Deps[1]>({ findById: jest.fn() });
    userRolesRepo = createMock<Deps[2]>({
      findActiveByUser: jest.fn(),
      findActive: jest.fn(),
      assign: jest.fn(),
      revoke: jest.fn(),
    });
    audit = createMock<Deps[3]>({ record: jest.fn() });
    service = new UsersService(usersRepo, rolesRepo, userRolesRepo, audit);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getMe', () => {
    it('không tồn tại → NotFound', async () => {
      usersRepo.findById.mockResolvedValue(null);
      await expect(service.getMe('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trả hồ sơ + danh sách role code (bỏ role null)', async () => {
      usersRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        displayName: 'A',
        avatarUrl: null,
        isActive: true,
      });
      userRolesRepo.findActiveByUser.mockResolvedValue([{ role: { code: 'member' } }, { role: null }]);

      await expect(service.getMe('u1')).resolves.toEqual({
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        avatar_url: null,
        is_active: true,
        roles: ['member'],
      });
    });
  });

  describe('updateMe', () => {
    it('cập nhật displayName/avatarUrl rồi lưu', async () => {
      usersRepo.findById.mockResolvedValue({ id: 'u1', displayName: 'Old', avatarUrl: null });
      const out = await service.updateMe('u1', {
        display_name: 'New',
        avatar_url: 'http://x/y.png',
      } as Parameters<typeof service.updateMe>[1]);

      expect(usersRepo.save).toHaveBeenCalled();
      expect(out).toEqual({ id: 'u1', display_name: 'New', avatar_url: 'http://x/y.png' });
    });
  });

  describe('assignRole', () => {
    it('vai trò không thể gán → BadRequest', async () => {
      usersRepo.findById.mockResolvedValue({ id: 'u1' });
      rolesRepo.findById.mockResolvedValue({ id: 'r1', isAssignable: false });
      await expect(
        service.assignRole('u1', { role_id: 'r1' } as Parameters<typeof service.assignRole>[1], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scope managed thiếu business_id → BadRequest', async () => {
      usersRepo.findById.mockResolvedValue({ id: 'u1' });
      rolesRepo.findById.mockResolvedValue({ id: 'r1', isAssignable: true });
      await expect(
        service.assignRole('u1', { role_id: 'r1', scope_type: ScopeType.MANAGED } as Parameters<typeof service.assignRole>[1], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('đã gán trước đó → BadRequest', async () => {
      usersRepo.findById.mockResolvedValue({ id: 'u1' });
      rolesRepo.findById.mockResolvedValue({ id: 'r1', isAssignable: true });
      userRolesRepo.findActive.mockResolvedValue({ id: 'ur1' });
      await expect(
        service.assignRole('u1', { role_id: 'r1' } as Parameters<typeof service.assignRole>[1], 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hợp lệ → assign với grantedBy + scope global mặc định', async () => {
      usersRepo.findById.mockResolvedValue({ id: 'u1' });
      rolesRepo.findById.mockResolvedValue({ id: 'r1', isAssignable: true });
      userRolesRepo.findActive.mockResolvedValue(null);

      await service.assignRole('u1', { role_id: 'r1' } as Parameters<typeof service.assignRole>[1], 'admin');

      expect(userRolesRepo.assign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          roleId: 'r1',
          grantedBy: 'admin',
          scopeType: ScopeType.GLOBAL,
          businessId: null,
        }),
      );
      // ADR-016: ghi audit `role.assigned`
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'role.assigned', entityId: 'u1', actorId: 'admin' }),
      );
    });
  });

  describe('revokeRole', () => {
    it('tự thu hồi vai trò của chính mình → Forbidden', async () => {
      await expect(service.revokeRole('u1', 'r1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRolesRepo.revoke).not.toHaveBeenCalled();
    });

    it('hợp lệ → gọi revoke + ghi audit', async () => {
      await service.revokeRole('u1', 'r1', 'admin');
      expect(userRolesRepo.revoke).toHaveBeenCalledWith('u1', 'r1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'role.revoked', entityId: 'u1', actorId: 'admin' }),
      );
    });
  });
});
