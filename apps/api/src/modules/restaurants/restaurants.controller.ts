import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { RestaurantsService } from './restaurants.service';
import { UpdateRestaurantMenuDto } from './dto/restaurants.dto';

// openapi §Restaurants. Đọc công khai; sửa menu cần Place.Edit.Managed.
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.restaurantsService.list(page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  }

  @Public()
  @Get(':id/menu')
  getMenu(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantsService.getMenu(id);
  }

  @Patch(':id/menu')
  @RequirePermissions('Place.Edit.Managed')
  updateMenu(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRestaurantMenuDto) {
    return this.restaurantsService.updateMenu(id, dto);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.restaurantsService.getBySlug(slug);
  }
}
