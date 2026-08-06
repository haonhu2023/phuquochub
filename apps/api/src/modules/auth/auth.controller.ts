import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../authz/decorators/public.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

// PLACE-028 (OD2-12): login/register là mục tiêu brute-force/spam kinh điển — giới hạn
// nghiêm ngặt hơn mức mặc định toàn cục. Cấu hình qua RATE_LIMIT_AUTH_TTL/_LIMIT.
const AUTH_THROTTLE = {
  default: {
    ttl: (parseInt(process.env.RATE_LIMIT_AUTH_TTL ?? '60', 10)) * 1000,
    limit: parseInt(process.env.RATE_LIMIT_AUTH_LIMIT ?? '10', 10),
  },
};

// Kênh Web/Mobile — auth.md. Controller mỏng: chỉ nhận request, gọi service.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshDto, @CurrentUser() _user: AuthPrincipal) {
    await this.authService.logout(dto.refresh_token);
    return null;
  }

  /**
   * H-1 — đăng xuất khỏi MỌI thiết bị. KHÔNG `@Public()`: route đã xác thực, và `userId` LUÔN lấy
   * từ JWT (`@CurrentUser`), KHÔNG từ body — nên không thể đăng xuất hộ người khác. Không nhận body
   * nào cả (không cần refresh token: chỉ mục theo user trên Redis đã cho biết mọi jti cần xoá).
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: AuthPrincipal) {
    await this.authService.logoutAll(user.sub);
    return null;
  }
}
