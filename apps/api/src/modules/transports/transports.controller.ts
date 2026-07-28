import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { TransportsService } from './transports.service';
import { ListTransportsQueryDto } from './dto/transports.dto';

// openapi §Transports. Nhiệm vụ nền tảng (ADR-017): CHỈ đọc — list/detail. Không có endpoint
// ghi nào ở đây; tạo/sửa một Transport listing vẫn đi qua `POST|PATCH /places` với permission
// sẵn có, đúng như Attractions/Beaches.
@Controller('transports')
export class TransportsController {
  constructor(private readonly transportsService: TransportsService) {}

  @Public()
  @Get()
  list(@Query() query: ListTransportsQueryDto) {
    return this.transportsService.list(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.transportsService.getBySlug(slug);
  }
}
