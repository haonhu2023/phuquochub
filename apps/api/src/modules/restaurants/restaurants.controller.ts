import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { RestaurantsService } from './restaurants.service';
import { ListRestaurantsQueryDto, UpdateRestaurantDetailsDto, UpdateRestaurantMenuDto } from './dto/restaurants.dto';

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

  // Toàn bộ từ điển cuisines (cho admin UI chọn) — đặt TRƯỚC ':slug' (đoạn một khúc), nếu không
  // ':slug' sẽ nuốt mất '/restaurants/cuisines' y hệt lý do 'mine'/'now' phải đứng trước :slug ở
  // PlacesController.
  @Public()
  @Get('cuisines')
  listAllCuisines() {
    return this.restaurantsService.listAllCuisines();
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.restaurantsService.getBySlug(slug);
  }

  // Đọc đặc quyền — hoạt động cả khi place CHƯA published (form sửa cần tải lại giá trị hiện tại
  // của một nhà hàng còn draft/pending). Đoạn 2 khúc, không xung đột thứ tự với ':slug'.
  @Get(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  getDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantsService.getDetails(id);
  }

  // loại ẩm thực/đặc sản địa phương/chế độ ăn — xem UpdateRestaurantDetailsDto. UPSERT.
  @Patch(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDetailsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.restaurantsService.updateDetails(id, dto, user.sub);
  }
}
