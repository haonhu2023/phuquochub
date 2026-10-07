import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { JobListingsService } from './job-listings.service';
import { DecideJobListingDto, ListJobListingsQueryDto, UpsertJobListingDto } from './dto/job-listings.dto';

// Cùng khuôn PlaceEditProposalsController: route 'mine' khai TRƯỚC ':id' để tránh ParseUUIDPipe
// nuốt nhầm. Đọc công khai (list/detail) KHÔNG yêu cầu đăng nhập — @Public().
@Controller('job-listings')
export class JobListingsController {
  constructor(private readonly service: JobListingsService) {}

  @Get()
  @Public()
  list(@Query() query: ListJobListingsQueryDto) {
    return this.service.listPublic(query);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthPrincipal) {
    return this.service.listMine(user.sub);
  }

  @Get('mine/:id')
  getMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.getMine(id, user.sub);
  }

  @Get('pending')
  @RequirePermissions('JobListing.Moderate')
  listPending() {
    return this.service.listPending();
  }

  @Get(':id')
  @Public()
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPublicById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('JobListing.Create')
  create(@Body() dto: UpsertJobListingDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('JobListing.Create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertJobListingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Post(':id/submit')
  @RequirePermissions('JobListing.Create')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.submit(id, user.sub);
  }

  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.close(id, user.sub);
  }

  @Post(':id/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.reopen(id, user.sub);
  }

  @Post(':id/decide')
  @RequirePermissions('JobListing.Moderate')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideJobListingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.decide(id, dto, user.sub);
  }
}
