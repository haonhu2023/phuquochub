import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';

/**
 * content_owner self-approve wrapper (INV-12 exception, 2026-09-16) — route RIÊNG, tách khỏi
 * `PlaceMediaController` (apps/api/src/modules/media/place-media.controller.ts) vì MediaModule
 * KHÔNG import ModerationModule ngược lại (media.module.ts's own comment: sẽ tạo vòng lặp hai
 * bước MediaModule -> ModerationModule -> MediaModule). Sống trong ModerationModule (đã có sẵn
 * ModerationService), nhưng mang path `places/:placeId/media/:mediaId/...` để khớp đúng không
 * gian tên mà chủ cơ sở đã quen (cùng tiền tố PlaceMediaController dùng) — Nest không yêu cầu
 * path của route phải trùng tên module khai báo nó.
 *
 * `Media.Upload.Managed` là permission gác ROUTE (cùng mọi route quản lý ảnh khác của
 * PlaceMediaController — "có được quản lý ảnh cơ sở này không") — KHÔNG phải năng lực tự duyệt
 * thật sự, năng lực đó nằm hoàn toàn trong `ModerationService.selfApproveOwnMedia()` ->
 * `decide()`'s INV-12 exact-match check trên `Media.Moderate.Own`. Một business_manager thường
 * (không có Media.Moderate.Own) qua được guard route này nhưng vẫn nhận 403 từ bên trong service
 * — đúng ý "kiểm tra permission chính xác ở tầng service, không chỉ ẩn nút ở frontend".
 */
@Controller('places/:placeId/media')
export class PlaceMediaSelfApproveController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post(':mediaId/self-approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async selfApprove(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.moderationService.selfApproveOwnMedia(placeId, mediaId, user.sub);
    return null;
  }
}
