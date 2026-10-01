import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BeachesService } from './beaches.service';
import { ListBeachesQueryDto, UpdateBeachDetailsDto } from './dto/beaches.dto';
import { GetPlaceDetailQueryDto } from '../places/dto/places.dto';

// openapi §Beaches. Từ InitBeachDetails1720007700000 (product spec, 2026-09-29) có
// place_beach_details, nên nay có GET/PATCH :slug/:id/details — cùng khuôn Hotels/Restaurants.
// `GET /places/{slug}` vẫn là chi tiết CƠ BẢN; `GET /beaches/{slug}` chỉ ghép thêm beach_details.
@Controller('beaches')
export class BeachesController {
  constructor(private readonly beachesService: BeachesService) {}

  @Public()
  @Get()
  list(@Query() query: ListBeachesQueryDto) {
    return this.beachesService.list(query);
  }

  // đường vào/đặc điểm bãi/mùa tham khảo/dịch vụ/thông tin cứu hộ/lưu ý có nguồn — xem
  // UpdateBeachDetailsDto. UPSERT.
  @Patch(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBeachDetailsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.beachesService.updateDetails(id, dto, user.sub);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string, @Query() query: GetPlaceDetailQueryDto) {
    return this.beachesService.getBySlug(slug, query.locale);
  }
}
