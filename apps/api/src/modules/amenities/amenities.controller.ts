import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { AmenitiesService } from './amenities.service';
import { UpdatePlaceAmenitiesDto } from './dto/amenities.dto';

// Dict dùng chung (place_id-scoped, không phải hotel-only — xem AmenitiesRepository). Đọc công
// khai; ghi cần Place.Edit.Managed đúng place đó, cùng khuôn PricesController/UpdateHotelRoomsDto.
@Controller()
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Public()
  @Get('amenities')
  listAll(@Query('group') group?: string) {
    return this.amenitiesService.listAll(group);
  }

  @Public()
  @Get('places/:id/amenities')
  listForPlace(@Param('id', ParseUUIDPipe) id: string) {
    return this.amenitiesService.listForPlace(id);
  }

  @Put('places/:id/amenities')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateForPlace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlaceAmenitiesDto, @CurrentUser() user: AuthPrincipal) {
    return this.amenitiesService.updateForPlace(id, dto.amenity_codes, dto.expected_content_version, user.sub);
  }
}
