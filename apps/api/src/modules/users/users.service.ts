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
import { AuthRevocationService } from '../../core/auth-revocation/auth-revocation.service';
import { UpdateMeDto, AssignRoleDto } from './dto/users.dto';

// H-1 (Owner Decision D3, 2026-08-06): sau khi gán/thu hồi vai trò THÀNH CÔNG, mọi access token cũ
// của user ĐÍCH bị thu hồi ngay qua `AuthRevocationService` — nếu không, một moderator vừa bị thu
// hồi vai trò vẫn giữ quyền moderator tới hết `JWT_ACCESS_TTL` (đúng lỗi H-1 mô tả).
//
// GHI NHẬN THẲNG về tính nguyên tử giữa HAI HỆ THỐNG (Owner "security-side-effect rule"): mutation
// `user_roles` nằm ở Postgres, mốc thu hồi nằm ở Redis — KHÔNG có transaction chung. Nếu Redis lỗi,
// `revokeAllForUser` NÉM lỗi (503) và lỗi đó nổi lên tới client, NHƯNG mutation vai trò trong DB
// **ĐÃ COMMIT** và audit log **ĐÃ GHI**. Trạng thái sau lỗi: vai trò đã đổi, token cũ CHƯA bị thu
// hồi (sống tới hết TTL). Ta chọn phơi lỗi thay vì nuốt nó, để người vận hành biết cần gọi lại; một
// giải pháp mạnh hơn (outbox/retry) cần hạ tầng chưa có trong repo này và KHÔNG thuộc phạm vi H-1.
// Thứ tự DB -> audit -> revoke là có chủ đích: audit ghi TRƯỚC bước Redis nên hành động đặc quyền
// luôn có vết, kể cả khi việc thu hồi thất bại.
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
    private readonly authRevocation: AuthRevocationService,
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
    // H-1: quyền của user đích vừa đổi -> vô hiệu hoá NGAY mọi access token cũ của họ.
    await this.authRevocation.revokeAllForUser(userId);
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
    // H-1: quyền của user đích vừa bị thu hẹp -> vô hiệu hoá NGAY mọi access token cũ của họ.
    await this.authRevocation.revokeAllForUser(userId);
    return null;
  }
}
