import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { RestaurantsService } from './restaurants.service';
import { ListRestaurantsQueryDto, UpdateRestaurantMenuDto } from './dto/restaurants.dto';

// openapi §Restaurants. Đọc công khai; sửa menu cần Place.Edit.Managed.
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get()
  list(@Query() query: ListRestaurantsQueryDto) {
    return this.restaurantsService.list(query);
  }

  @Public()
  @Get(':id/menu')
  getMenu(@Param('id', ParseUUIDPipe) id: string) {
    // Public Beta price trust gate (2026-08-28): route công khai → luôn redact raw price
    // (menu items không có trust column riêng để gate theo từng món, xem restaurants.service.ts).
    return this.restaurantsService.getMenu(id, { publicResponse: true });
  }

  @Patch(':id/menu')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateMenu(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRestaurantMenuDto) {
    return this.restaurantsService.updateMenu(id, dto);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.restaurantsService.getBySlug(slug);
  }
}
