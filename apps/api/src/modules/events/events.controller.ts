import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/events.dto';

// openapi §Events (peer). Đọc công khai; POST /events cần Event.Create (EV-1, rbac.md §3.3).
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get()
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.eventsService.list(page ? Number(page) : undefined, limit ? Number(limit) : undefined);
  }

  // Route tĩnh 'calendar' khai báo trước ':slug'.
  @Public()
  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.eventsService.calendar(from, to);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Event.Create')
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthPrincipal) {
    return this.eventsService.create(dto, user.sub);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.eventsService.getBySlug(slug);
  }
}
