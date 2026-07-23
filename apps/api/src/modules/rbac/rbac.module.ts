import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { RoleParent } from './entities/role-parent.entity';
import { UserRole } from './entities/user-role.entity';
import { RolesRepository } from './repositories/roles.repository';
import { PermissionsRepository } from './repositories/permissions.repository';
import { UserRolesRepository } from './repositories/user-roles.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { RbacController } from './rbac.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, RolePermission, RoleParent, UserRole])],
  controllers: [RbacController],
  providers: [RolesRepository, PermissionsRepository, UserRolesRepository, AuthorizationService],
  exports: [RolesRepository, PermissionsRepository, UserRolesRepository, AuthorizationService],
})
export class RbacModule {}
