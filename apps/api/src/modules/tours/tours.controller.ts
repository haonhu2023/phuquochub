import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ToursService } from './tours.service';
import { CreateTourDto, ListToursQueryDto, UpdateTourDetailsDto, UpdateTourStopsDto } from './dto/tours.dto';

// openapi §Tours. Đọc công khai; POST /tours cần Place.Create (Tour là Place → pending).
@Controller('tours')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Public()
  @Get()
  list(@Query() query: ListToursQueryDto) {
    return this.toursService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Place.Create')
  create(@Body() dto: CreateTourDto, @CurrentUser() user: AuthPrincipal) {
    return this.toursService.create(dto, user.sub);
  }

  @Public()
  @Get(':id/itinerary')
  getItinerary(@Param('id', ParseUUIDPipe) id: string) {
    return this.toursService.getItinerary(id);
  }

  // Đơn vị tổ chức/thời lượng/độ khó/điểm đón/bao gồm-không bao gồm/chính sách hủy — xem
  // UpdateTourDetailsDto.
  @Patch(':id/details')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTourDetailsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.toursService.updateDetails(id, dto, user.sub);
  }

  // "Lịch trình theo mốc" — thay TOÀN BỘ, cùng khuôn PATCH :id/rooms (Hotels)/:id/menu (Restaurants).
  @Put(':id/itinerary')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  updateItinerary(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTourStopsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.toursService.updateItinerary(id, dto, user.sub);
  }

  @Public()
  @Get(':id/schedule')
  getSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.toursService.getSchedule(id);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.toursService.getBySlug(slug);
  }
}
