import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { HotelsService } from './hotels.service';
import { ListHotelsQueryDto, UpdateHotelRoomsDto } from './dto/hotels.dto';

// openapi §Hotels. Đọc công khai; sửa rooms cần Place.Edit.Managed (Hotel là Place).
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Public()
  @Get()
  list(@Query() query: ListHotelsQueryDto) {
    return this.hotelsService.list(query);
  }

  // Route 2 đoạn khai báo trước ':slug' (1 đoạn) cho rõ ràng.
  @Public()
  @Get(':id/rooms')
  listRooms(@Param('id', ParseUUIDPipe) id: string) {
    // Public Beta price trust gate (2026-08-28): route công khai → luôn redact raw price
    // (room types không có trust column riêng để gate theo từng loại phòng, xem hotels.service.ts).
    return this.hotelsService.listRooms(id, { publicResponse: true });
  }

  @Patch(':id/rooms')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateRooms(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHotelRoomsDto) {
    return this.hotelsService.updateRooms(id, dto);
  }

  @Public()
  @Get(':id/amenities')
  listAmenities(@Param('id', ParseUUIDPipe) id: string) {
    return this.hotelsService.listAmenities(id);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.hotelsService.getBySlug(slug);
  }
}
