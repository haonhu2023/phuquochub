import { Injectable } from '@nestjs/common';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { isAllowed } from './authorization.util';

export interface EffectivePermissions {
  allow: string[];
  deny: string[];
}

// PDP (Policy Decision Point): suy ra quyền hiệu lực & quyết định Allow/Deny.
// security.md §5: gom role (trực tiếp + kế thừa DAG) → union permission → wildcard → deny thắng.
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly userRolesRepo: UserRolesRepository,
    private readonly rolesRepo: RolesRepository,
  ) {}

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const directRoleIds = await this.userRolesRepo.findActiveRoleIds(userId);
    const allRoleIds = await this.rolesRepo.expandWithAncestors(directRoleIds);
    const rows = await this.rolesRepo.getPermissionsForRoles(allRoleIds);
    return {
      allow: rows.filter((r) => r.effect === 'allow').map((r) => r.code),
      deny: rows.filter((r) => r.effect === 'deny').map((r) => r.code),
    };
  }

  /** Principal có được thực hiện `requiredPermission` không (fail-closed). */
  async can(userId: string, requiredPermission: string): Promise<boolean> {
    const { allow, deny } = await this.getEffectivePermissions(userId);
    return isAllowed(allow, deny, requiredPermission);
  }
}
