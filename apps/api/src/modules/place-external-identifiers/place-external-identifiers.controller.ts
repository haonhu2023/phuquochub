import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import {
  UpsertGooglePlaceIdDto,
  ConfirmGooglePlaceIdDto,
  RevokeGooglePlaceIdVerificationDto,
} from './dto/place-external-identifiers.dto';

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
//   xác nhận được MỌI place, không giới hạn "place họ quản lý").
//
// ĐIỀU CHỈNH kết luận (2026-10-16, owner sửa sau khi đọc lại): tách quyền chỉ bảo đảm "người CHỈ
// giữ Place.Edit.Managed (vd business_manager quản lý MỘT place) không tự xác nhận được" — đây là
// bất biến THẬT, enforce bằng guard. Nó KHÔNG bảo đảm "người nhập ID không bao giờ là người xác
// nhận": `content_owner` giữ CẢ HAI permission (Place.Edit.Any thoả mãn Place.Edit.Managed theo
// xếp hạng scope, VÀ PlaceExternalIdentifier.Verify) nên một content_owner có thể tự nhập rồi tự
// xác nhận — ĐÚNG Ý ở MVP này (owner xác nhận: content_owner được phép làm cả hai bước, miễn audit
// ghi đúng actor/thao tác thật — xem AuditService.record() ở service). KHÔNG quảng bá đây là cơ
// chế duyệt hai người độc lập — nó không phải vậy theo thiết kế hiện tại.
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

  // `dto.expected_external_id` BẮT BUỘC — ID người xác nhận ĐÃ đọc/đối chiếu, không phải "ID hiện
  // tại theo server". Lệch → 409 (xem ConflictException trong service), không âm thầm xác nhận ID
  // vừa bị thay.
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
      expectedExternalId: dto.expected_external_id,
      sourceId: dto.source_id,
      evidenceId: dto.evidence_id,
    });
    return this.service.toResponse(row);
  }

  @Post(':id/external-identifiers/google-places/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PlaceExternalIdentifier.Verify')
  async revokeGooglePlaceIdVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeGooglePlaceIdVerificationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const row = await this.service.revokeGooglePlaceIdVerification({
      placeId: id,
      actorId: user.sub,
      expectedExternalId: dto.expected_external_id,
    });
    return this.service.toResponse(row);
  }
}
