import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { RealEstateListingsService } from './real-estate-listings.service';
import {
  AdminListRealEstateListingsQueryDto,
  DecideRealEstateListingDto,
  ListRealEstateListingsQueryDto,
  UpsertRealEstateListingDto,
} from './dto/real-estate-listings.dto';

// Cùng khuôn JobListingsController: route 'mine'/'pending'/'admin' khai TRƯỚC ':id'. Đọc công khai
// KHÔNG yêu cầu đăng nhập. close/reopen/mark-* không có @RequirePermissions tĩnh — quyết định
// sở hữu-hoặc-moderator nằm trong service (xem RealEstateListingsService.loadOwnedOrModerated()).
@Controller('real-estate-listings')
export class RealEstateListingsController {
  constructor(private readonly service: RealEstateListingsService) {}

  @Get()
  @Public()
  list(@Query() query: ListRealEstateListingsQueryDto) {
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
  @RequirePermissions('RealEstateListing.Moderate')
  listPending() {
    return this.service.listPending();
  }

  // Khác 'pending' (chỉ chờ duyệt): mọi status, lọc tuỳ chọn theo status/người đăng — màn hình
  // "quản lý tất cả tin" cho admin (Gói B, 17/10/2026).
  @Get('admin')
  @RequirePermissions('RealEstateListing.Moderate')
  listAllForAdmin(@Query() query: AdminListRealEstateListingsQueryDto) {
    return this.service.listAllForAdmin(query);
  }

  @Get(':id')
  @Public()
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPublicById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('RealEstateListing.Create')
  create(@Body() dto: UpsertRealEstateListingDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('RealEstateListing.Create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertRealEstateListingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Post(':id/submit')
  @RequirePermissions('RealEstateListing.Create')
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

  @Post(':id/mark-rented')
  markRented(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.markRented(id, user.sub);
  }

  @Post(':id/mark-sold')
  markSold(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.markSold(id, user.sub);
  }

  @Post(':id/mark-available')
  markAvailable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.markAvailable(id, user.sub);
  }

  @Post(':id/decide')
  @RequirePermissions('RealEstateListing.Moderate')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRealEstateListingDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.decide(id, dto, user.sub);
  }
}
