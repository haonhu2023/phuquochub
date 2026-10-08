import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { RealEstateListingPhotosService } from './real-estate-listing-photos.service';
import { PresignRealEstateListingPhotoDto, RegisterRealEstateListingPhotoDto } from './dto/real-estate-listing-photos.dto';

// Sở hữu được kiểm Ở SERVICE (RealEstateListingsService.getMine) — cùng cách
// close()/reopen()/mark-*() của RealEstateListingsController không có @AuthorizationContext tĩnh.
// `RealEstateListing.Create` là quyền "đăng/sửa tin của chính mình" đã có sẵn — không thêm quyền
// mới, ảnh chỉ là một phần nội dung của tin.
@Controller('real-estate-listings/:id/photos')
export class RealEstateListingPhotosController {
  constructor(private readonly service: RealEstateListingPhotosService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('RealEstateListing.Create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: PresignRealEstateListingPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.presign(listingId, user.sub, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('RealEstateListing.Create')
  register(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: RegisterRealEstateListingPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.register(listingId, user.sub, dto);
  }

  @Get()
  @Public()
  listPublic(@Param('id', ParseUUIDPipe) listingId: string) {
    return this.service.listPublic(listingId);
  }

  @Get('mine')
  @RequirePermissions('RealEstateListing.Create')
  listMine(@Param('id', ParseUUIDPipe) listingId: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.listMine(listingId, user.sub);
  }

  // Cùng thiết kế MediaController#file: 302 tới signed GET URL ngắn hạn, không stream bytes qua
  // Nest. @Public — ảnh của tin ĐANG công khai phải xem được không cần đăng nhập.
  @Get(':photoId/file')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async file(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const signedUrl = await this.service.resolvePublicFileUrl(listingId, photoId);
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.service.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }

  // Kênh chủ tin — xem ảnh của chính mình ở bất kỳ trạng thái tin (nháp/chờ duyệt/đã đóng).
  @Get(':photoId/owner-file')
  @RequirePermissions('RealEstateListing.Create')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async ownerFile(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const signedUrl = await this.service.resolveOwnerFileUrl(listingId, photoId, user.sub);
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.service.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }

  @Delete(':photoId')
  @RequirePermissions('RealEstateListing.Create')
  async remove(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.service.remove(listingId, photoId, user.sub);
    return null;
  }
}
