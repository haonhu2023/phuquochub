import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { ModerationService } from './moderation.service';
import { ListModerationCasesQueryDto } from './dto/moderation.dto';

// M2 (Moderation Queue Read API, ADR-018/moderation-design.md §9). CHỈ ĐỌC — không action nào
// đổi trạng thái (claim/decide/reopen thuộc M3/M4, KHÔNG có ở đây). Cả hai route cùng đòi
// `Moderation.Queue.View`, scope Any (O6) — JwtAuthGuard + PermissionsGuard đã global (AuthModule,
// APP_GUARD), không cần khai báo guard riêng ở đây, cùng quy ước BookingsController.
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
}
