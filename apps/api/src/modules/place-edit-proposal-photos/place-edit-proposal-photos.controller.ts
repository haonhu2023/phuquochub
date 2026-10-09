import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { PlaceEditProposalPhotosService } from './place-edit-proposal-photos.service';
import { PresignProposalPhotoDto, RegisterProposalPhotoDto } from './dto/place-edit-proposal-photo.dto';

// Sở hữu được kiểm Ở SERVICE (PlaceEditProposalsService.getMine(), qua assertOwned()) — không có
// `@AuthorizationContext` nào ứng với "đề xuất của chính người gọi" (khác place/review, sở hữu
// không gắn với một permission theo tài nguyên PDP đánh giá được). `PlaceEditProposal.Create` là
// quyền "gửi đề xuất của chính mình" đã có sẵn — ảnh chỉ là bằng chứng kèm theo, không cần quyền mới.
@Controller('place-edit-proposals/:id/media')
export class PlaceEditProposalPhotosController {
  constructor(private readonly service: PlaceEditProposalPhotosService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('PlaceEditProposal.Create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Body() dto: PresignProposalPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.presign(proposalId, user.sub, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('PlaceEditProposal.Create')
  register(
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Body() dto: RegisterProposalPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.register(proposalId, user.sub, dto);
  }

  @Get()
  @RequirePermissions('PlaceEditProposal.Create')
  listMine(@Param('id', ParseUUIDPipe) proposalId: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.listMine(proposalId, user.sub);
  }

  // Cùng thiết kế MediaController#file: 302 tới signed GET URL ngắn hạn. KHÔNG @Public — ảnh góp ý
  // không bao giờ công khai, chỉ chính người gửi (ở BẤT KỲ trạng thái kiểm duyệt) xem được qua
  // đây; moderator xem qua route chung `/media/{id}/moderation-file` đã có sẵn (target-type-
  // agnostic, không cần route riêng cho nhánh proposal).
  @Get(':mediaId/file')
  @RequirePermissions('PlaceEditProposal.Create')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async file(
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const signedUrl = await this.service.resolveOwnerFileUrl(proposalId, mediaId, user.sub);
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.service.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }
}
