import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthRevocationService } from '../../../core/auth-revocation/auth-revocation.service';

// PEP tầng AuthN: xác thực access JWT, gắn principal vào request. @Public() bỏ qua.
//
// H-1 (Production Readiness Audit, 2026-08-06): sau khi chữ ký hợp lệ, guard còn đối chiếu MỐC THU
// HỒI của user trên Redis (`AuthRevocationService`) — nhờ đó access token có thể bị vô hiệu hoá NGAY
// thay vì sống tới hết `JWT_ACCESS_TTL`. Đúng MỘT `GET` Redis mỗi request đã xác thực, KHÔNG truy
// vấn DB. Route `@Public()` return TRƯỚC bước này nên kênh công khai không hề chạm Redis.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly revocation: AuthRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Thiếu access token');
    }

    let payload: { sub: string; email?: string; iat?: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Access token không hợp lệ hoặc đã hết hạn');
    }

    // H-1: NGOÀI khối try/catch trên — `assertNotRevoked` tự ném `UnauthorizedException` với thông
    // điệp RIÊNG ("phiên đã bị thu hồi" vs "token không hợp lệ/hết hạn"), và fail-closed khi Redis
    // lỗi. Gộp vào try/catch trên sẽ nuốt mất sự phân biệt đó thành một 401 chung chung.
    await this.revocation.assertNotRevoked(payload.sub, payload.iat);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).user = { sub: payload.sub, email: payload.email };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
