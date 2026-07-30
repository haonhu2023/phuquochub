import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilitySlotDto, ListAvailabilityQueryDto } from './dto/availability.dto';

// Availability & Inventory Foundation — kênh NỘI BỘ (admin/staff định nghĩa dung lượng, ops xem
// remaining capacity), KHÔNG public. Chỉ 2 endpoint tối thiểu cho luồng nội bộ — KHÔNG có
// endpoint tạo/xem hold riêng: hold chỉ được tạo qua BookingsService.create() (mục C của yêu cầu),
// và xem qua GET /availability-slots's held_quantity/remaining_capacity đã đủ cho Foundation này.
@Controller('availability-slots')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @RequirePermissions('Availability.View')
  list(@Query() query: ListAvailabilityQueryDto) {
    return this.availabilityService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Availability.Manage')
  create(@Body() dto: CreateAvailabilitySlotDto) {
    return this.availabilityService.createSlot(dto);
  }
}
