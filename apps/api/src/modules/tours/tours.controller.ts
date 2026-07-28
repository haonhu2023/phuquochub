import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ToursService } from './tours.service';
import { CreateTourDto, ListToursQueryDto } from './dto/tours.dto';

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
