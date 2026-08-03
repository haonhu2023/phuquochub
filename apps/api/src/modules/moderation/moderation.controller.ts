import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';
import { DecideModerationCaseDto, ListModerationCasesQueryDto } from './dto/moderation.dto';

// M2 (Queue Read API) + M3 (Media Decision) + M4 (Review Decision, ADR-018/moderation-design.md
// §9). `list`/`getById` CHỈ ĐỌC (Moderation.Queue.View). `decide` là hành động đặc quyền duy nhất
// ở đây, hỗ trợ CẢ target_type=media (Media.Moderate) LẪN target_type=review (Review.Moderate) —
// nhưng KHÔNG có `@RequirePermissions` tĩnh ở route này: quyền cần kiểm tra phụ thuộc target_type
// CỦA CHÍNH CASE, một giá trị chỉ biết được sau khi đọc case (runtime), nên
// `ModerationService.decide()` tự chọn và kiểm tra permission đúng bằng `AuthorizationService`
// sau khi khoá+đọc case — xem comment ở đó. JwtAuthGuard vẫn global (401 cho request chưa đăng
// nhập); PermissionsGuard KHÔNG chặn gì thêm ở route này vì không có metadata permission nào khai
// báo (đã xác thực là đủ để vào tới service — service tự deny nếu thiếu quyền cụ thể, 403).
// claim/release/reopen VÀ `/media/{id}/moderate` (stub riêng) đều CHƯA triển khai.
@Controller('moderation/cases')
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  @Get()
  @RequirePermissions('Moderation.Queue.View')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  list(@Query() query: ListModerationCasesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('Moderation.Queue.View')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideModerationCaseDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.service.decide(id, dto, user.sub);
    return null;
  }
}
