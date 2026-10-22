import { Controller, Get, Header, Query } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogQueryDto } from './dto/audit-log.dto';

// Cùng quyền `Ops.Dashboard.View` với OwnerDashboardController — cùng đối tượng (content_owner),
// cùng loại truy cập "xem vận hành chỉ-đọc" (comment gốc migration: "Do not reuse content editing
// permissions for audit access"), không phải lý do để tách một permission riêng cho một trang
// sibling trong CÙNG module Ops.
@Controller('admin/ops')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get('audit-log')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('Ops.Dashboard.View')
  async list(@Query() query: ListAuditLogQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit, 20, 100);
    const { items, total } = await this.service.list(
      {
        entityType: query.entity_type,
        entityId: query.entity_id,
        actorId: query.actor_id,
        event: query.event,
        result: query.result,
        from: query.from,
        to: query.to,
      },
      page,
      limit,
    );
    return paginate(items, page, limit, total);
  }
}
