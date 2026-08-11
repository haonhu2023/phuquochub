import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessManagersService } from './business-managers.service';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { AuditService } from '../../core/audit/audit.service';
import { BusinessMember } from './entities/business-member.entity';
import { Role } from '../rbac/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { MemberRole } from './business.enums';
import { ScopeType } from '../rbac/rbac.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeMember(overrides: Partial<BusinessMember> = {}): BusinessMember {
  const m = new BusinessMember();
  m.id = 'member-1';
  m.placeId = 'place-1';
  m.userId = 'target-1';
  m.role = MemberRole.MANAGER;
  m.claimId = null;
  m.grantedBy = 'owner-1';
  m.grantedAt = new Date('2026-08-05T00:00:00Z');
  m.revokedAt = null;
  return Object.assign(m, overrides);
}

function makeRole(overrides: Partial<Role> = {}): Role {
  const r = new Role();
  r.id = 'role-business-manager';
  r.code = 'business_manager';
  r.name = 'Business Manager';
  return Object.assign(r, overrides);
}

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'target-1';
  u.email = 'target@phuquochub.test';
  u.displayName = 'Target User';
  return Object.assign(u, overrides);
}

describe('BusinessManagersService', () => {
  let membersRepo: LooseMock<BusinessMembersRepository>;
  let usersRepo: LooseMock<UsersRepository>;
  let rolesRepo: LooseMock<RolesRepository>;
  let userRolesRepo: LooseMock<UserRolesRepository>;
  let audit: LooseMock<AuditService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: BusinessManagersService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    membersRepo = createMock<BusinessMembersRepository>({
      findActiveMembershipForUpdate: jest.fn(),
      createManager: jest.fn(),
      revokeMembership: jest.fn(),
      listActiveManagers: jest.fn(),
    });
    usersRepo = createMock<UsersRepository>({ findById: jest.fn(), findByEmail: jest.fn() });
    rolesRepo = createMock<RolesRepository>({ findByCode: jest.fn().mockResolvedValue(makeRole()) });
    userRolesRepo = createMock<UserRolesRepository>({ assign: jest.fn(), revoke: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new BusinessManagersService(membersRepo, usersRepo, rolesRepo, userRolesRepo, audit, dataSource);
  });

  describe('assign', () => {
    it('target user không tồn tại -> NotFoundException, KHÔNG mở transaction', async () => {
      usersRepo.findById.mockResolvedValue(null);
      await expect(service.assign('place-1', 'missing-user', 'owner-1')).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('target đã có vai trò hiệu lực (owner hoặc manager) tại cơ sở -> ConflictException, KHÔNG tạo gì', async () => {
      usersRepo.findById.mockResolvedValue(makeUser());
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(makeMember({ role: MemberRole.OWNER }));

      await expect(service.assign('place-1', 'target-1', 'owner-1')).rejects.toThrow(ConflictException);
      expect(membersRepo.createManager).not.toHaveBeenCalled();
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });

    it('thành công -> createManager + userRolesRepo.assign(scope Managed, business_id=placeId) ĐÚNG tham số, audit business.manager_assigned', async () => {
      usersRepo.findById.mockResolvedValue(makeUser());
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
      membersRepo.createManager.mockResolvedValue(makeMember());
      rolesRepo.findByCode.mockResolvedValue(makeRole());

      const result = await service.assign('place-1', 'target-1', 'owner-1');

      expect(membersRepo.createManager).toHaveBeenCalledWith(manager, {
        placeId: 'place-1',
        userId: 'target-1',
        grantedBy: 'owner-1',
      });
      expect(userRolesRepo.assign).toHaveBeenCalledWith(
        {
          userId: 'target-1',
          roleId: 'role-business-manager',
          scopeType: ScopeType.MANAGED,
          businessId: 'place-1',
          grantedBy: 'owner-1',
        },
        manager,
      );
      expect(result.id).toBe('member-1');
      expect(result.role).toBe(MemberRole.MANAGER);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'business.manager_assigned', entityType: 'business_member', actorId: 'owner-1' }),
      );
    });

    it('audit CHỈ được gọi SAU khi mọi ghi DB hoàn tất (thứ tự lời gọi)', async () => {
      usersRepo.findById.mockResolvedValue(makeUser());
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
      membersRepo.createManager.mockResolvedValue(makeMember());

      const order: string[] = [];
      userRolesRepo.assign.mockImplementation(async () => {
        order.push('userRolesRepo.assign');
        return {} as never;
      });
      audit.record.mockImplementation(async () => {
        order.push('audit');
      });

      await service.assign('place-1', 'target-1', 'owner-1');
      expect(order).toEqual(['userRolesRepo.assign', 'audit']);
    });
  });

  describe('listManagers', () => {
    it('truyền ĐÚNG placeId xuống repository, không biến đổi thêm', async () => {
      membersRepo.listActiveManagers.mockResolvedValue([]);
      await service.listManagers('place-1');
      expect(membersRepo.listActiveManagers).toHaveBeenCalledWith('place-1');
    });

    it('map sang response snake_case, role luôn "manager", KHÔNG email/password nào khác lộ ra ngoài field đã join', async () => {
      membersRepo.listActiveManagers.mockResolvedValue([
        { userId: 'u1', displayName: 'Manager One', email: 'm1@phuquochub.test', grantedAt: new Date('2026-08-10T00:00:00Z') },
      ]);

      const result = await service.listManagers('place-1');

      expect(result).toEqual([
        {
          user_id: 'u1',
          display_name: 'Manager One',
          email: 'm1@phuquochub.test',
          role: MemberRole.MANAGER,
          granted_at: '2026-08-10T00:00:00.000Z',
        },
      ]);
    });

    it('cơ sở chưa có manager nào -> mảng rỗng', async () => {
      membersRepo.listActiveManagers.mockResolvedValue([]);
      const result = await service.listManagers('place-1');
      expect(result).toEqual([]);
    });
  });

  describe('lookupUserByEmail', () => {
    it('không tìm thấy user -> NotFoundException', async () => {
      usersRepo.findByEmail.mockResolvedValue(null);
      await expect(service.lookupUserByEmail('missing@phuquochub.test')).rejects.toThrow(NotFoundException);
    });

    it('tìm thấy -> trả ĐÚNG user_id + display_name, KHÔNG echo email/password/field khác', async () => {
      usersRepo.findByEmail.mockResolvedValue(makeUser({ id: 'target-9', displayName: 'Target Nine', email: 'nine@phuquochub.test' }));

      const result = await service.lookupUserByEmail('nine@phuquochub.test');

      expect(usersRepo.findByEmail).toHaveBeenCalledWith('nine@phuquochub.test');
      expect(result).toEqual({ user_id: 'target-9', display_name: 'Target Nine' });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('password_hash');
    });
  });

  describe('revoke', () => {
    it('không có membership hiệu lực -> NotFoundException', async () => {
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
      await expect(service.revoke('place-1', 'target-1', 'owner-1')).rejects.toThrow(NotFoundException);
      expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
    });

    it('membership hiệu lực là OWNER (không phải manager) -> NotFoundException, KHÔNG thu hồi owner qua endpoint này (BR-B6)', async () => {
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(makeMember({ role: MemberRole.OWNER }));
      await expect(service.revoke('place-1', 'target-1', 'owner-1')).rejects.toThrow(NotFoundException);
      expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
      expect(userRolesRepo.revoke).not.toHaveBeenCalled();
    });

    it('thành công -> revokeMembership + userRolesRepo.revoke(userId, roleId, placeId, manager) ĐÚNG tham số (scoped theo cơ sở), audit business.manager_revoked', async () => {
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(makeMember());
      rolesRepo.findByCode.mockResolvedValue(makeRole());

      await service.revoke('place-1', 'target-1', 'owner-1');

      expect(membersRepo.revokeMembership).toHaveBeenCalledWith(manager, 'member-1');
      expect(userRolesRepo.revoke).toHaveBeenCalledWith('target-1', 'role-business-manager', 'place-1', manager);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'business.manager_revoked', entityType: 'business_member', actorId: 'owner-1' }),
      );
    });

    it('audit CHỈ được gọi SAU khi userRolesRepo.revoke hoàn tất', async () => {
      membersRepo.findActiveMembershipForUpdate.mockResolvedValue(makeMember());

      const order: string[] = [];
      userRolesRepo.revoke.mockImplementation(async () => {
        order.push('userRolesRepo.revoke');
      });
      audit.record.mockImplementation(async () => {
        order.push('audit');
      });

      await service.revoke('place-1', 'target-1', 'owner-1');
      expect(order).toEqual(['userRolesRepo.revoke', 'audit']);
    });
  });
});
