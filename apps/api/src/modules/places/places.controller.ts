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

  // P1 (Owner self-publish, 2026-09-22) — danh sách MỌI place (mọi status), cho đội biên tập toàn
  // cục (EditorialPlacesView). Đặt TRƯỚC ':slug' cùng lý do 'mine' ở trên — 'editorial' phải
  // không bị nuốt như thể là một slug.
  @Get('editorial')
  @RequirePermissions('Place.Edit.Any')
  listEditorial(@Query() query: ListPlacesQueryDto) {
    return this.placesService.listEditorial(query);
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

  // P1 (Owner self-publish, 2026-09-22) — symmetric to /approve: gỡ công khai về `draft`, KHÁC
  // `archive()` (soft-delete). Cùng permission `Place.Approve` — ai duyệt được thì gỡ được.
  @Post(':id/unpublish')
  @RequirePermissions('Place.Approve')
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.unpublish(id, user.sub);
  }

  // P3 (Preview riêng tư, 2026-09-22) — cho owner xem place CHƯA xuất bản (draft/pending) đúng
  // hình dạng PlaceDetail trước khi bấm publish. Đặt sau ':id/revisions' và ':id/approve' —
  // đoạn cuối cố định 'preview' không đụng route tham số nào ở trên (không có tham số một đoạn
  // nào khác khớp chuỗi này). Dùng CHÍNH `Place.Edit.Managed` + `@AuthorizationContext` mà PATCH
  // đã dùng — "xem trước được" ĐÚNG BẰNG "sửa được", không phải một khái niệm quyền mới.
  @Get(':id/preview')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.preview(id);
  }
}
