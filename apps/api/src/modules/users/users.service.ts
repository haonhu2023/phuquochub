import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { AuditService } from '../../core/audit/audit.service';
import { UpdateMeDto, AssignRoleDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const roles = await this.userRolesRepo.findActiveByUser(userId);
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      is_active: user.isActive,
      roles: roles.map((r) => r.role?.code).filter(Boolean),
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (dto.display_name !== undefined) {
      user.displayName = dto.display_name;
    }
    if (dto.avatar_url !== undefined) {
      user.avatarUrl = dto.avatar_url;
    }
    const saved = await this.usersRepo.save(user);
    return { id: saved.id, display_name: saved.displayName, avatar_url: saved.avatarUrl };
  }

  async getPublicProfile(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return { id: user.id, display_name: user.displayName, avatar_url: user.avatarUrl };
  }

  async assignRole(userId: string, dto: AssignRoleDto, grantedBy: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const role = await this.rolesRepo.findById(dto.role_id);
    if (!role) {
      throw new NotFoundException('Không tìm thấy vai trò');
    }
    if (!role.isAssignable) {
      throw new BadRequestException('Vai trò này không thể gán trực tiếp');
    }
    const scopeType = dto.scope_type ?? ScopeType.GLOBAL;
    if (scopeType === ScopeType.MANAGED && !dto.business_id) {
      throw new BadRequestException('scope_type=managed cần business_id');
    }
    const existing = await this.userRolesRepo.findActive(userId, dto.role_id, dto.business_id ?? null);
    if (existing) {
      throw new BadRequestException('Vai trò đã được gán');
    }
    await this.userRolesRepo.assign({
      userId,
      roleId: dto.role_id,
      scopeType,
      businessId: dto.business_id ?? null,
      grantedBy,
    });
    // ADR-016: hành động đặc quyền → ghi audit bất biến (event `role.assigned`).
    await this.audit.record({
      event: 'role.assigned',
      entityType: 'user',
      entityId: userId,
      actorId: grantedBy,
      permission: 'Role.Assign',
      context: { role_id: dto.role_id, scope_type: scopeType, business_id: dto.business_id ?? null },
    });
    return null;
  }

  async revokeRole(userId: string, roleId: string, actorId: string) {
    if (userId === actorId) {
      throw new ForbiddenException('Không thể tự thu hồi vai trò của chính mình');
    }
    await this.userRolesRepo.revoke(userId, roleId);
    await this.audit.record({
      event: 'role.revoked',
      entityType: 'user',
      entityId: userId,
      actorId,
      permission: 'Role.Assign',
      context: { role_id: roleId },
    });
    return null;
  }
}
