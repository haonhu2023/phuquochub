import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PRINCIPAL_RESOLVER } from '../authz/resolvers/principal.resolver';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateMeDto, AssignRoleDto } from './dto/users.dto';

// api.md §10. Lưu ý thứ tự route: 'me' khai báo trước ':id'.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthPrincipal) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  @RequirePermissions('User.Edit.Own')
  @AuthorizationContext({
    resourceType: 'user',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  updateMe(@CurrentUser() user: AuthPrincipal, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Public()
  @Get(':id')
  getPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Post(':id/roles')
  @RequirePermissions('Role.Assign')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.usersService.assignRole(id, dto, actor.sub);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('Role.Assign')
  revokeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.usersService.revokeRole(id, roleId, actor.sub);
  }
}
