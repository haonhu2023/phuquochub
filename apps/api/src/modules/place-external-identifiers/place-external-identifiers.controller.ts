import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import { UpsertGooglePlaceIdDto } from './dto/place-external-identifiers.dto';

// Dashboard-only — KHÔNG @Public. Cùng cặp decorator/permission với mọi route sửa place khác
// (PlacesController 'Place.Edit.Managed' + AuthorizationContext theo :id) — ai sửa được thông tin
// place đó thì sửa được định danh ngoài của nó, không phải quyền riêng biệt. Route sống ở module
// riêng (PlaceExternalIdentifiersModule), không gộp vào PlacesController, để giữ đúng ranh giới
// module đã có (service này vốn export cho job remediation/import dùng trực tiếp).
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
  // chỉ vì owner vừa nhập ID.
  @Put(':id/external-identifiers/google-places')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  async upsertGooglePlaceId(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertGooglePlaceIdDto) {
    const row = await this.service.upsertPrimaryGooglePlaceId({
      placeId: id,
      externalId: dto.external_id,
      sourceId: dto.source_id ?? null,
      evidenceId: dto.evidence_id ?? null,
    });
    return this.service.toResponse(row);
  }
}
