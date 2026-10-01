import { Controller, Get, Header, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { OwnerDashboardService } from './owner-dashboard.service';

export class OwnerDashboardQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
}

@Controller('admin/ops')
export class OwnerDashboardController {
  constructor(private readonly service: OwnerDashboardService) {}

  @Get('dashboard')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions('Ops.Dashboard.View')
  read(@Query() query: OwnerDashboardQuery) {
    return this.service.read(query.page);
  }
}
