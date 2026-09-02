import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PlacesService } from './places.service';
import { RevisionsService } from '../revisions/revisions.service';
import { CreatePlaceDto, GetPlaceDetailQueryDto, ListPlacesQueryDto, UpdatePlaceDto } from './dto/places.dto';

// api.md §11. Đọc công khai; ghi qua permission (deny-by-default).
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly revisionsService: RevisionsService,
  ) {}

  @Public()
  @Get()
  list(@Query() query: ListPlacesQueryDto) {
    return this.placesService.list(query);
  }

  // PLACE-041 (Place Content Management MVP) — "địa điểm tôi quản lý" (business_id nào user có
  // grant Place.Edit.Managed hiệu lực). KHÔNG @Public — chỉ cần đã đăng nhập (JwtAuthGuard chặn
  // trước), KHÔNG khai @RequirePermissions: nội dung trả về đã TỰ lọc theo đúng userId của người
  // gọi (PlacesService.listMine), không có tài nguyên chung nào để đặt permission tĩnh lên — cùng
  // nhánh "endpoint không khai báo permission → chỉ cần đã xác thực" mà PermissionsGuard đã tài
  // liệu hoá sẵn (permissions.guard.ts). Đặt TRƯỚC ':id/revisions'/':slug' — nếu không, hai route
  // đoạn-đơn phía dưới sẽ nuốt mất '/places/mine' (khớp như thể 'mine' là slug/id).
  @Get('mine')
  listMine(@CurrentUser() user: AuthPrincipal) {
    return this.placesService.listMine(user.sub);
  }

  // openapi listPlaceRevisions — lịch sử wiki_revisions (entity_type='place').
  // Đặt trước ':slug' để route 2 đoạn không bị nuốt bởi param 1 đoạn.
  @Public()
  @Get(':id/revisions')
  listRevisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.revisionsService.listByPlace(id);
  }

  // Public Place i18n Read Path (2026-09-02): `?locale=vi|en` tuỳ chọn — không đổi shape phản
  // hồi hiện có, chỉ ghi đè `short_description` khi có bản dịch current/public/production hợp lệ.
  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Query() query: GetPlaceDetailQueryDto) {
    return this.placesService.getBySlug(slug, query.locale);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Place.Create')
  create(@Body() dto: CreatePlaceDto, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlaceDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('Place.Archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.archive(id, user.sub);
  }

  @Post(':id/approve')
  @RequirePermissions('Place.Approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.approve(id, user.sub);
  }
}
