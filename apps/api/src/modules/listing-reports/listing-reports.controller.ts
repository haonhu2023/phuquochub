import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ListingReportsService } from './listing-reports.service';
import { CreateListingReportDto, ResolveListingReportDto } from './dto/listing-reports.dto';

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

  @Post(':id/resolve')
  @HttpCode(200)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveListingReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.resolve(id, dto, user.sub);
  }
}
