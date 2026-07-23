import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserRole } from '../entities/user-role.entity';
import { ScopeType } from '../rbac.enums';

// Repository cho `user_roles` — gán/thu hồi vai trò (soft revoke), truy vấn role hiệu lực.
@Injectable()
export class UserRolesRepository {
  constructor(
    @InjectRepository(UserRole)
    private readonly repo: Repository<UserRole>,
  ) {}

  /** Role id đang hiệu lực (revoked_at IS NULL) của một principal. */
  async findActiveRoleIds(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  findActiveByUser(userId: string): Promise<UserRole[]> {
    return this.repo.find({ where: { userId, revokedAt: IsNull() }, relations: { role: true } });
  }

  async findActive(
    userId: string,
    roleId: string,
    businessId: string | null,
  ): Promise<UserRole | null> {
    return this.repo.findOne({
      where: { userId, roleId, businessId: businessId ?? IsNull(), revokedAt: IsNull() },
    });
  }

  assign(params: {
    userId: string;
    roleId: string;
    scopeType?: ScopeType;
    businessId?: string | null;
    grantedBy?: string | null;
  }): Promise<UserRole> {
    const userRole = this.repo.create({
      userId: params.userId,
      roleId: params.roleId,
      scopeType: params.scopeType ?? ScopeType.GLOBAL,
      businessId: params.businessId ?? null,
      grantedBy: params.grantedBy ?? null,
    });
    return this.repo.save(userRole);
  }

  /** Thu hồi (soft) mọi bản gán đang hiệu lực của (user, role). */
  async revoke(userId: string, roleId: string): Promise<void> {
    await this.repo.update({ userId, roleId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
