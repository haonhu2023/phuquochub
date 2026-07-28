import { Controller, Get } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { TransportsService } from './transports.service';

// Từ điển loại hình vận chuyển — route phẳng, top-level (không lồng dưới /transports), cùng vị
// trí kiến trúc với /categories. Endpoint MỚI: không vertical nào khác (Hotel amenities,
// Restaurant cuisines, ward mọi nơi) có tra cứu từ điển thật qua API — frontend các vertical đó
// đang hardcode danh sách vì thiếu đúng endpoint này (ADR-017 ghi nhận đây là cải tiến đóng một
// khoảng trống có sẵn, không phải nhu cầu riêng của Transport).
@Controller('transport-types')
export class TransportTypesController {
  constructor(private readonly transportsService: TransportsService) {}

  @Public()
  @Get()
  list() {
    return this.transportsService.listTypes();
  }
}
