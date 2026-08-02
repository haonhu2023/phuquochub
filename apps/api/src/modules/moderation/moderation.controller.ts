import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';
import { DecideModerationCaseDto, ListModerationCasesQueryDto } from './dto/moderation.dto';

// M2 (Queue Read API) + M3 (Media Decision, ADR-018/moderation-design.md §9). `list`/`getById`
// CHỈ ĐỌC (Moderation.Queue.View). `decide` là hành động đặc quyền duy nhất ở đây — gated bởi
// `Media.Moderate` (M3 chỉ hỗ trợ target_type=media; `Review.Moderate` tồn tại từ M1 nhưng KHÔNG
// route nào dùng tới nó ở milestone này — kiểm duyệt review là M4). claim/release/reopen VÀ
// `/media/{id}/moderate` (stub riêng) đều CHƯA triển khai — phạm vi M3 phiên này chỉ có `decide`.
// JwtAuthGuard + PermissionsGuard đã global (AuthModule, APP_GUARD) — không cần khai báo guard
// riêng, cùng quy ước BookingsController.
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
  @RequirePermissions('Media.Moderate')
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
