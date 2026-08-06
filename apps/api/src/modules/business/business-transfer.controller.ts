import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BusinessTransferService } from './business-transfer.service';
import { TransferBusinessOwnerDto } from './dto/business-transfer.dto';

// UC-B7 (business.md §5, product/business.md UC-B7). `Business.Transfer.Managed` CÓ hậu tố scope
// (Owner Decision 2) -> CẦN `@AuthorizationContext` (ADR-019 D9 chặn app khởi động nếu thiếu).
// `resourceType: 'place'` + tham số route `id` CHÍNH LÀ business id -> resolver mặc định
// `IDENTITY_PLACE_RESOLVER` (0 truy vấn), cùng khuôn `BusinessManagersController`. 200 (không phải
// 201) — hành động THAY THẾ trạng thái sở hữu hiện có, cùng quy ước `decide()`/`withdraw()`, khác
// "tạo thêm một thành viên mới" (managers, 201).
@Controller('business')
export class BusinessTransferController {
  constructor(private readonly service: BusinessTransferService) {}

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Business.Transfer.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferBusinessOwnerDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.transfer(id, dto.new_owner_id, user.sub, dto.reason);
  }
}
