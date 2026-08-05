import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
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
import {
  IDENTITY_PLACE_RESOLVER,
  IdentityPlaceResolver,
} from '../authz/resolvers/identity-place.resolver';
import { AuthorizationBootstrapValidator } from '../authz/bootstrap/authorization-bootstrap.validator';
import { RbacController } from './rbac.controller';

// RbacModule đóng vai trò "authz module" chia sẻ (không có NestJS Module riêng tên AuthzModule —
// AuthorizationService/guard đã sống ở đây từ M0.1). IDENTITY_PLACE_RESOLVER là resolver DÙNG
// CHUNG (D5: "nằm sẵn trong authz module") — không phụ thuộc DB, không thuộc riêng module tài
// nguyên nào. AuthorizationBootstrapValidator (D9) cần DiscoveryModule để quét toàn bộ controller
// lúc bootstrap.
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, RolePermission, RoleParent, UserRole]),
    DiscoveryModule,
  ],
  controllers: [RbacController],
  providers: [
    RolesRepository,
    PermissionsRepository,
    UserRolesRepository,
    AuthorizationService,
    { provide: IDENTITY_PLACE_RESOLVER, useClass: IdentityPlaceResolver },
    AuthorizationBootstrapValidator,
  ],
  exports: [
    RolesRepository,
    PermissionsRepository,
    UserRolesRepository,
    AuthorizationService,
    IDENTITY_PLACE_RESOLVER,
  ],
})
export class RbacModule {}
