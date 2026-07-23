import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthPrincipal {
  sub: string; // user id
  email: string;
}

// Lấy principal đã xác thực từ request (do JwtAuthGuard gắn vào).
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthPrincipal;
  },
);
