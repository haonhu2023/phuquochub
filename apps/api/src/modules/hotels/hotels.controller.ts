import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { HotelsService } from './hotels.service';
import { ListHotelsQueryDto, UpdateHotelDetailsDto, UpdateHotelRoomsDto } from './dto/hotels.dto';
// Cùng DTO `PlacesController`/`GET /places/:slug` đã dùng cho `?locale=` — tái sử dụng nguyên vẹn
// (validation `@IsOptional() @IsString() @MaxLength(35)`), không tự khai một DTO locale riêng cho
// hotels chỉ để lặp lại đúng 3 dòng đó.
import { GetPlaceDetailQueryDto } from '../places/dto/places.dto';

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

  // Đọc đặc quyền — hoạt động cả khi place CHƯA published (form sửa cần tải lại giá trị hiện tại
  // của một hotel còn draft/pending). Đặt TRƯỚC ':slug' cùng lý do các route 2 đoạn khác.
  @Get(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  getDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.hotelsService.getDetails(id);
  }

  // loại hình/hạng sao (có nguồn)/check-in-out — xem UpdateHotelDetailsDto. UPSERT: hoạt động cả
  // khi place_hotel_details chưa tồn tại (hotel vừa tạo).
  @Patch(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHotelDetailsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.hotelsService.updateDetails(id, dto, user.sub);
  }

  @Public()
  @Get(':id/amenities')
  listAmenities(@Param('id', ParseUUIDPipe) id: string) {
    return this.hotelsService.listAmenities(id);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string, @Query() query: GetPlaceDetailQueryDto) {
    return this.hotelsService.getBySlug(slug, query.locale);
  }
}
