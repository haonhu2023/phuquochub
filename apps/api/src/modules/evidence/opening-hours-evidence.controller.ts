import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { OpeningHoursEvidenceService } from './opening-hours-evidence.service';
import { SubmitOpeningHoursEvidenceDto, ReviewOpeningHoursEvidenceDto } from './dto/opening-hours-evidence.dto';

// Opening-Hours Evidence Workflow — luồng tối thiểu, CHỈ phục vụ opening_hours (xem
// opening-hours-evidence.service.ts). Nộp: cùng quyền sửa place (Place.Edit.Managed/.Any, cùng
// IDENTITY_PLACE_RESOLVER mọi route sửa place khác đang dùng). Duyệt: Source.Verify (hiện chỉ
// moderator) — tách biệt khỏi quyền nộp, không cho tự duyệt bằng chứng của chính mình.
@Controller()
export class OpeningHoursEvidenceController {
  constructor(private readonly service: OpeningHoursEvidenceService) {}

  @Post('places/:id/opening-hours-evidence')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitOpeningHoursEvidenceDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.submit(id, dto, user.sub);
  }

  @Get('opening-hours-evidence/pending')
  @RequirePermissions('Source.Verify')
  listPending() {
    return this.service.listPending();
  }

  @Post('opening-hours-evidence/:id/review')
  @RequirePermissions('Source.Verify')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewOpeningHoursEvidenceDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.review(id, dto, user.sub, user.email);
  }
}
