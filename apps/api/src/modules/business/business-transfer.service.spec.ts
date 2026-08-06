import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessTransferService } from './business-transfer.service';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { AuditService } from '../../core/audit/audit.service';
import { BusinessMember } from './entities/business-member.entity';
import { Role } from '../rbac/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { MemberRole } from './business.enums';
import { ScopeType } from '../rbac/rbac.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeOwnerMember(overrides: Partial<BusinessMember> = {}): BusinessMember {
  const m = new BusinessMember();
  m.id = 'owner-member-1';
  m.placeId = 'place-1';
  m.userId = 'old-owner-1';
  m.role = MemberRole.OWNER;
  m.claimId = 'claim-1';
  m.grantedBy = 'mod-1';
  m.grantedAt = new Date('2026-08-01T00:00:00Z');
  m.revokedAt = null;
  return Object.assign(m, overrides);
}

function makeNewOwnerMember(overrides: Partial<BusinessMember> = {}): BusinessMember {
  const m = new BusinessMember();
  m.id = 'owner-member-2';
  m.placeId = 'place-1';
  m.userId = 'new-owner-1';
  m.role = MemberRole.OWNER;
  m.claimId = null;
  m.grantedBy = 'old-owner-1';
  m.grantedAt = new Date('2026-08-05T00:00:00Z');
  m.revokedAt = null;
  return Object.assign(m, overrides);
}

function makeRole(overrides: Partial<Role> = {}): Role {
  const r = new Role();
  r.id = 'role-business-owner';
  r.code = 'business_owner';
  r.name = 'Business Owner';
  return Object.assign(r, overrides);
}

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'new-owner-1';
  u.email = 'new-owner@phuquochub.test';
  u.displayName = 'New Owner';
  return Object.assign(u, overrides);
}

function makeUserRole(overrides: Partial<UserRole> = {}): UserRole {
  const ur = new UserRole();
  ur.id = 'old-user-role-1';
  ur.userId = 'old-owner-1';
  ur.roleId = 'role-business-owner';
  ur.scopeType = ScopeType.MANAGED;
  ur.businessId = 'place-1';
  ur.grantedBy = null;
  ur.grantedAt = new Date('2026-08-01T00:00:00Z');
  ur.revokedAt = null;
  return Object.assign(ur, overrides);
}

describe('BusinessTransferService', () => {
  let membersRepo: LooseMock<BusinessMembersRepository>;
  let usersRepo: LooseMock<UsersRepository>;
  let rolesRepo: LooseMock<RolesRepository>;
  let userRolesRepo: LooseMock<UserRolesRepository>;
  let audit: LooseMock<AuditService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: BusinessTransferService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    membersRepo = createMock<BusinessMembersRepository>({
      findActiveOwnerForUpdate: jest.fn(),
      findActiveMembershipForUpdate: jest.fn(),
      createOwner: jest.fn(),
      revokeMembership: jest.fn(),
    });
    usersRepo = createMock<UsersRepository>({ findById: jest.fn() });
    rolesRepo = createMock<RolesRepository>({ findByCode: jest.fn().mockResolvedValue(makeRole()) });
    userRolesRepo = createMock<UserRolesRepository>({
      findActive: jest.fn(),
      assign: jest.fn(),
      revoke: jest.fn(),
    });
    audit = createMock<AuditService>({ record: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new BusinessTransferService(membersRepo, usersRepo, rolesRepo, userRolesRepo, audit, dataSource);
  });

  it('không có owner hiệu lực cho cơ sở -> NotFoundException, KHÔNG ghi gì (fail-safe, không nên xảy ra qua HTTP thật)', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
    await expect(service.transfer('place-1', 'new-owner-1', 'old-owner-1', undefined)).rejects.toThrow(
      NotFoundException,
    );
    expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
  });

  it('actor KHÔNG PHẢI owner hiệu lực -> ForbiddenException, KHÔNG ghi gì', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember({ userId: 'old-owner-1' }));
    await expect(service.transfer('place-1', 'new-owner-1', 'someone-else', undefined)).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersRepo.findById).not.toHaveBeenCalled();
    expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
  });

  it('target user không tồn tại -> NotFoundException', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(null);
    await expect(service.transfer('place-1', 'missing-user', 'old-owner-1', undefined)).rejects.toThrow(
      NotFoundException,
    );
    expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
  });

  it('target ĐÃ là owner hiệu lực (transfer cho chính mình) -> ConflictException', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember({ userId: 'old-owner-1' }));
    usersRepo.findById.mockResolvedValue(makeUser({ id: 'old-owner-1' }));
    await expect(service.transfer('place-1', 'old-owner-1', 'old-owner-1', undefined)).rejects.toThrow(
      ConflictException,
    );
  });

  it('target đang có vai trò hiệu lực khác (manager) -> ConflictException (uq_member_active), managers giữ nguyên', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(
      Object.assign(new BusinessMember(), { id: 'mgr-1', role: MemberRole.MANAGER }),
    );

    await expect(service.transfer('place-1', 'new-owner-1', 'old-owner-1', undefined)).rejects.toThrow(
      ConflictException,
    );
    expect(membersRepo.revokeMembership).not.toHaveBeenCalled();
    expect(membersRepo.createOwner).not.toHaveBeenCalled();
  });

  it('thành công -> revoke owner cũ + role cũ, tạo owner mới (claim_id=null) + role mới, ĐÚNG tham số', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
    userRolesRepo.findActive.mockResolvedValue(makeUserRole());
    membersRepo.createOwner.mockResolvedValue(makeNewOwnerMember());
    userRolesRepo.assign.mockResolvedValue(makeUserRole({ id: 'new-user-role-1', userId: 'new-owner-1' }));

    const result = await service.transfer('place-1', 'new-owner-1', 'old-owner-1', 'bán cơ sở');

    expect(membersRepo.revokeMembership).toHaveBeenCalledWith(manager, 'owner-member-1');
    expect(userRolesRepo.revoke).toHaveBeenCalledWith('old-owner-1', 'role-business-owner', 'place-1', manager);
    expect(membersRepo.createOwner).toHaveBeenCalledWith(manager, {
      placeId: 'place-1',
      userId: 'new-owner-1',
      claimId: null,
      grantedBy: 'old-owner-1',
    });
    expect(userRolesRepo.assign).toHaveBeenCalledWith(
      {
        userId: 'new-owner-1',
        roleId: 'role-business-owner',
        scopeType: ScopeType.MANAGED,
        businessId: 'place-1',
        grantedBy: 'old-owner-1',
      },
      manager,
    );
    expect(result.id).toBe('owner-member-2');
    expect(result.role).toBe(MemberRole.OWNER);
    expect(result.user_id).toBe('new-owner-1');
  });

  it('audit ghi ĐẦY ĐỦ context: business_id/from/to/initiated_by/reason/old+new membership id/old+new user_role id', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
    userRolesRepo.findActive.mockResolvedValue(makeUserRole({ id: 'old-user-role-1' }));
    membersRepo.createOwner.mockResolvedValue(makeNewOwnerMember({ id: 'owner-member-2' }));
    userRolesRepo.assign.mockResolvedValue(makeUserRole({ id: 'new-user-role-1' }));

    await service.transfer('place-1', 'new-owner-1', 'old-owner-1', 'bán cơ sở');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'business.ownership_transferred',
        entityType: 'business_member',
        entityId: 'owner-member-2',
        actorId: 'old-owner-1',
        context: {
          business_id: 'place-1',
          from_user_id: 'old-owner-1',
          to_user_id: 'new-owner-1',
          initiated_by: 'old-owner-1',
          reason: 'bán cơ sở',
          old_membership_id: 'owner-member-1',
          new_membership_id: 'owner-member-2',
          old_user_role_id: 'old-user-role-1',
          old_user_role_revoked: true,
          new_user_role_id: 'new-user-role-1',
        },
      }),
    );
  });

  it('reason không truyền -> audit context.reason = null', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
    userRolesRepo.findActive.mockResolvedValue(makeUserRole());
    membersRepo.createOwner.mockResolvedValue(makeNewOwnerMember());
    userRolesRepo.assign.mockResolvedValue(makeUserRole({ id: 'new-user-role-1' }));

    await service.transfer('place-1', 'new-owner-1', 'old-owner-1', undefined);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ reason: null }) }),
    );
  });

  it('old_user_role_id = null khi không tìm thấy grant cũ (fail-safe, không chặn transfer)', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
    userRolesRepo.findActive.mockResolvedValue(null);
    membersRepo.createOwner.mockResolvedValue(makeNewOwnerMember());
    userRolesRepo.assign.mockResolvedValue(makeUserRole({ id: 'new-user-role-1' }));

    await service.transfer('place-1', 'new-owner-1', 'old-owner-1', undefined);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ old_user_role_id: null }) }),
    );
  });

  it('audit CHỈ được gọi SAU khi mọi ghi DB hoàn tất (thứ tự lời gọi)', async () => {
    membersRepo.findActiveOwnerForUpdate.mockResolvedValue(makeOwnerMember());
    usersRepo.findById.mockResolvedValue(makeUser());
    membersRepo.findActiveMembershipForUpdate.mockResolvedValue(null);
    userRolesRepo.findActive.mockResolvedValue(makeUserRole());
    membersRepo.createOwner.mockResolvedValue(makeNewOwnerMember());

    const order: string[] = [];
    userRolesRepo.assign.mockImplementation(async () => {
      order.push('userRolesRepo.assign');
      return makeUserRole({ id: 'new-user-role-1' });
    });
    audit.record.mockImplementation(async () => {
      order.push('audit');
    });

    await service.transfer('place-1', 'new-owner-1', 'old-owner-1', undefined);
    expect(order).toEqual(['userRolesRepo.assign', 'audit']);
  });
});
