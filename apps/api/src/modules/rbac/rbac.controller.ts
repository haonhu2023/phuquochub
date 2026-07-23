import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { RolesRepository } from './repositories/roles.repository';
import { PermissionsRepository } from './repositories/permissions.repository';

// Quản trị lược đồ RBAC (đọc) — api.md §10.1. Ghi role/permission bổ sung ở Sprint sau.
@Controller()
export class RbacController {
  constructor(
    private readonly rolesRepo: RolesRepository,
    private readonly permsRepo: PermissionsRepository,
  ) {}

  @Get('roles')
  @RequirePermissions('Role.Assign')
  listRoles() {
    return this.rolesRepo.findAll();
  }

  @Get('permissions')
  @RequirePermissions('Permission.Manage')
  listPermissions() {
    return this.permsRepo.findAll();
  }
}
