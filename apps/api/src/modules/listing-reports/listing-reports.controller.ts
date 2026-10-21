import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ListingReportsService } from './listing-reports.service';
import { CreateListingReportDto, ListMineOpenReportsQueryDto, ResolveListingReportDto } from './dto/listing-reports.dto';

// Không @RequirePermissions tĩnh — báo cáo chỉ cần đăng nhập; xem hàng chờ/xử lý được lọc theo
// quyền duyệt của TỪNG loại tin ngay trong service (xem ListingReportsService's comment ở đầu file).
@Controller('listing-reports')
export class ListingReportsController {
  constructor(private readonly service: ListingReportsService) {}

  // Cùng mức giới hạn ReportsController khác trong repo — chặn báo cáo hàng loạt.
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() dto: CreateListingReportDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(user.sub, dto);
  }

  @Get('pending')
  listPending(@CurrentUser() user: AuthPrincipal) {
    return this.service.listPending(user.sub);
  }

  // Giai đoạn 2 (21/10/2026) — báo cáo đang mở trên CHÍNH tin của người gọi, để tự xem + xác nhận
  // "vẫn còn" (xem confirmStillValid() bên dưới). 'mine' là đoạn tĩnh, không xung đột với bất kỳ
  // route `:id` nào trong controller này.
  @Get('mine')
  listMineOpen(@Query() query: ListMineOpenReportsQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.listMineOpen(user.sub, query.target_type);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveListingReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.resolve(id, dto, user.sub);
  }

  // Giai đoạn 2 (21/10/2026) — người ĐĂNG tự xác nhận tin của mình vẫn đúng (không phải moderator
  // xử lý — xem resolve() ở trên, route khác, quyền khác). Không @RequirePermissions tĩnh — chỉ
  // cần đăng nhập, isOwnListing() trong service tự kiểm có đúng chủ tin không.
  @Post(':id/confirm-still-valid')
  @HttpCode(200)
  async confirmStillValid(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.confirmStillValid(id, user.sub);
  }
}
