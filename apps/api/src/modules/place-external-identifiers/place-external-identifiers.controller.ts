import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import { UpsertGooglePlaceIdDto, ConfirmGooglePlaceIdDto } from './dto/place-external-identifiers.dto';

// Dashboard-only — KHÔNG @Public. Route sống ở module riêng (PlaceExternalIdentifiersModule),
// không gộp vào PlacesController, để giữ đúng ranh giới module đã có (service này vốn export cho
// job remediation/import dùng trực tiếp).
//
// HAI quyền KHÁC NHAU trên cùng controller (2026-10-16, chốt phạm vi "xác nhận"):
// - `list`/`upsertGooglePlaceId` (nhập/đề xuất ID): 'Place.Edit.Managed' + AuthorizationContext
//   theo :id — CÙNG quyền sửa place đó, người quản lý place được nhập/sửa ID họ đề xuất.
// - `confirmGooglePlaceId`/`revokeGooglePlaceIdVerification` (xác nhận hồ sơ Google KHỚP địa
//   điểm): 'PlaceExternalIdentifier.Verify' — quyền RIÊNG (migration 1720009100000), KHÔNG
//   AuthorizationContext (vai trò toàn cục, giống Place.Approve/Price.Verify — ai giữ quyền này
//   xác nhận được MỌI place, không giới hạn "place họ quản lý"). Cố ý KHÔNG dùng Place.Edit.Managed
//   cho hành động confirm — người nhập ID không được tự xác nhận chính ID mình vừa nhập.
@Controller('places')
export class PlaceExternalIdentifiersController {
  constructor(private readonly service: PlaceExternalIdentifiersService) {}

  @Get(':id/external-identifiers')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  async list(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.service.listByPlace(id);
    return rows.map((r) => this.service.toResponse(r));
  }

  // PUT (không PATCH): thay TOÀN BỘ identifier GOOGLE_PLACES của place này bằng giá trị mới — dùng
  // upsertPrimaryGooglePlaceId() (KHÔNG phải ensureIdentifier(), xem lý do đầy đủ ở ghi chú của
  // hàm đó trong service: ensureIdentifier có thể chèn hàng thứ hai khi sửa một ID đã nhập sai).
  // `verifiedAt` KHÔNG BAO GIỜ đọc từ `dto` — route này KHÔNG có cách nào tự đánh dấu đã xác minh
  // chỉ vì owner vừa nhập ID. `dto.source_id`/`dto.evidence_id` truyền THẲNG (không `?? null`) —
  // service tự phân biệt "không gửi" (giữ nguyên, khi lưu lại đúng ID cũ) với "gửi giá trị" (cập
  // nhật) cho nhánh lưu-lại-cùng-ID; nhánh tạo mới/đổi ID tự coi undefined là null.
  @Put(':id/external-identifiers/google-places')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  async upsertGooglePlaceId(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertGooglePlaceIdDto) {
    const row = await this.service.upsertPrimaryGooglePlaceId({
      placeId: id,
      externalId: dto.external_id,
      sourceId: dto.source_id,
      evidenceId: dto.evidence_id,
    });
    return this.service.toResponse(row);
  }

  @Post(':id/external-identifiers/google-places/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PlaceExternalIdentifier.Verify')
  async confirmGooglePlaceId(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmGooglePlaceIdDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const row = await this.service.confirmGooglePlaceId({
      placeId: id,
      actorId: user.sub,
      sourceId: dto.source_id,
      evidenceId: dto.evidence_id,
    });
    return this.service.toResponse(row);
  }

  @Post(':id/external-identifiers/google-places/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PlaceExternalIdentifier.Verify')
  async revokeGooglePlaceIdVerification(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    const row = await this.service.revokeGooglePlaceIdVerification({ placeId: id, actorId: user.sub });
    return this.service.toResponse(row);
  }
}
