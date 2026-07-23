import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthorizationService } from '../authorization.service';

// PEP tầng AuthZ: đọc permission yêu cầu (metadata) → hỏi PDP. Deny-by-default.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // endpoint không khai báo permission → chỉ cần đã xác thực
    }

    const request = context.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (request as any).user as { sub: string } | undefined;
    if (!user?.sub) {
      throw new UnauthorizedException('Cần đăng nhập');
    }

    for (const permission of required) {
      const ok = await this.authz.can(user.sub, permission);
      if (!ok) {
        throw new ForbiddenException(`Thiếu quyền: ${permission}`);
      }
    }
    return true;
  }
}
