import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BusinessManagersService } from './business-managers.service';
import { AssignBusinessManagerDto, LookupBusinessUserQueryDto } from './dto/business-manager.dto';

// UC-B6 (business.md §5). `Business.Manager.Assign.Managed`/`Revoke.Managed` CÓ hậu tố scope —
// khác `Business.Claim`/`Business.Verify` (M3) — nên CẦN `@AuthorizationContext` (ADR-019 D9 sẽ
// chặn app khởi động nếu thiếu). `resourceType: 'place'` + tham số route `id` CHÍNH LÀ business id
// (Model A) -> resolver mặc định `IDENTITY_PLACE_RESOLVER` (0 truy vấn), cùng khuôn
// `PlacesController.update()`. PDP so khớp `business_id` của grant Managed (chỉ `business_owner`
// giữ hai permission này) với `id` route — actor không phải owner hiệu lực của ĐÚNG cơ sở này bị
// 403 tự động, KHÔNG cần kiểm tra thủ công nào ở service (Owner Decision 5).
@Controller('business')
export class BusinessManagersController {
  constructor(private readonly service: BusinessManagersService) {}

  @Post(':id/managers')
  @RequirePermissions('Business.Manager.Assign.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBusinessManagerDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.assign(id, dto.user_id, user.sub);
  }

  @Delete(':id/managers/:userId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Business.Manager.Revoke.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.service.revoke(id, userId, user.sub);
    return null;
  }

  // Manager Management prerequisite gap (2026-08-11) — danh sách manager hiệu lực của cơ sở. CÙNG
  // permission với assign (`Business.Manager.Assign.Managed`) — không phải permission mới: chỉ
  // `business_owner` giữ permission này (SeedBusinessManagerPermissions), nên tự động chặn manager
  // xem/quản lý manager khác (đúng yêu cầu BR-B6) mà KHÔNG cần kiểm tra thủ công nào ở service.
  @Get(':id/managers')
  @RequirePermissions('Business.Manager.Assign.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listManagers(id);
  }

  // Tra user_id từ email CHÍNH XÁC để điền form gán manager — Phase 4 quyết định B (xem
  // dto/business-manager.dto.ts). CÙNG cổng phân quyền với list/assign (chỉ owner hiệu lực của
  // ĐÚNG cơ sở `id`), throttle CHẶT hơn 30/60s của assign vì đây là tra cứu (bề mặt dò email nhạy
  // hơn một hành động ghi).
  @Get(':id/managers/lookup')
  @RequirePermissions('Business.Manager.Assign.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  lookupUser(@Param('id', ParseUUIDPipe) id: string, @Query() query: LookupBusinessUserQueryDto) {
    return this.service.lookupUserByEmail(query.email);
  }
}
