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
import {
  CreatePlaceDto,
  EnIndexableIdsDto,
  GetPlaceDetailQueryDto,
  ListPlacesQueryDto,
  RightNowQueryDto,
  SaveDescriptionDraftDto,
  SaveNameDraftDto,
  SaveShortDescriptionDraftDto,
  UpdatePlaceDto,
} from './dto/places.dto';

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

  // "Right Now" MVP — additive, đọc công khai. Đặt TRƯỚC ':slug' (đoạn param một khúc) — nếu
  // không, ':slug' sẽ nuốt mất '/places/now' y hệt lý do 'mine'/':id/revisions' ở dưới phải đứng
  // trước nó.
  @Public()
  @Get('now')
  listRightNow(@Query() query: RightNowQueryDto) {
    return this.placesService.listRightNow(query);
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

  // SEO1 (2026-09-22) — sitemap-only batched EN-indexation check (place/hotel/restaurant/tour đều
  // là hàng `places`, xem PlacesService.listEnIndexableIds's comment). POST (không phải GET) vì
  // danh sách id có thể vượt giới hạn độ dài query string an toàn của một số hạ tầng trung gian;
  // không xung đột thứ tự route với ':slug' — khác HTTP method thì không có nguy cơ bị nuốt.
  @Public()
  @Post('en-indexable-ids')
  @HttpCode(HttpStatus.OK)
  listEnIndexableIds(@Body() body: EnIndexableIdsDto) {
    return this.placesService.listEnIndexableIds(body.ids);
  }

  // openapi listPlaceRevisions — lịch sử wiki_revisions (entity_type='place').
  // Đặt trước ':slug' để route 2 đoạn không bị nuốt bởi param 1 đoạn.
  @Public()
  @Get(':id/revisions')
  listRevisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.revisionsService.listByPlace(id);
  }

  // Lưu nháp (content_owner draft/publish, 2026-09-16) — CÙNG permission/scope với PATCH ở dưới
  // (Place.Edit.Managed theo placeId): không phải quyền riêng cho một vai trò. KHÔNG bao gồm
  // name/short_description/description — ba trường đó CHỈ qua nhóm route .../description/... bên
  // dưới (place_translations thật, không phải cột places.<col>). Đặt TRƯỚC ':slug'.
  @Post(':id/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlaceDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.saveDraft(id, dto, user.sub);
  }

  @Post(':id/revisions/:revisionId/publish')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  publishDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.publishDraft(id, revisionId, user.sub);
  }

  // Mô tả VI/EN thật sự đi qua place_translations (Public Place i18n Read Path) — KHÔNG phải
  // cột places.description. Ba route này là cách DUY NHẤT được hỗ trợ để sửa mô tả có kiểm soát
  // bản nháp/công khai; PATCH :id (update() ở dưới) vẫn ghi trực tiếp places.description cho
  // luồng community-edit cũ, KHÔNG đổi hành vi đó.
  @Get(':id/description/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  getDescriptionDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.getDescriptionDraft(id);
  }

  @Post(':id/description/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  saveDescriptionDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveDescriptionDraftDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.saveDescriptionDraft(id, dto, user.sub);
  }

  @Post(':id/description/publish')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  publishDescriptionDraft(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.publishDescriptionDraft(id, user.sub);
  }

  // Tên hiển thị VI/EN (2026-09-17) — CÙNG khuôn nhóm description ở trên, field_key `display_name`.
  @Get(':id/name/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  getNameDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.getNameDraft(id);
  }

  @Post(':id/name/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  saveNameDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveNameDraftDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.saveNameDraft(id, dto, user.sub);
  }

  @Post(':id/name/publish')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  publishNameDraft(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.publishNameDraft(id, user.sub);
  }

  // Mô tả ngắn VI/EN (2026-09-17) — CÙNG khuôn nhóm description ở trên, field_key `short_description`.
  @Get(':id/short-description/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  getShortDescriptionDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.getShortDescriptionDraft(id);
  }

  @Post(':id/short-description/draft')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  saveShortDescriptionDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveShortDescriptionDraftDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.saveShortDescriptionDraft(id, dto, user.sub);
  }

  @Post(':id/short-description/publish')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  publishShortDescriptionDraft(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.publishShortDescriptionDraft(id, user.sub);
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
