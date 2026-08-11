import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { CreateMediaDto, PresignMediaDto } from './dto/media.dto';

/**
 * Ảnh CỦA CƠ SỞ do chủ/quản lý cơ sở tự đăng (Owner Place Photos, 2026-08-11).
 *
 * VÌ SAO LÀ ROUTE RIÊNG THEO `places/:id` chứ không thêm `place_id` vào body của `/media/presign`:
 * `PermissionsGuard.extractResourceId()` chỉ đọc được resource id từ ROUTE PARAM hoặc principal —
 * KHÔNG đọc từ body. Đặt place id vào path là điều kiện CẦN để `@AuthorizationContext` phân giải
 * và cưỡng chế được `Media.Upload.Managed` trên ĐÚNG cơ sở đó. Hệ quả bảo mật then chốt: giá trị
 * mà guard đã kiểm tra quyền CHÍNH LÀ giá trị service dùng để gắn ảnh — không tồn tại đường nào để
 * client "tráo" sang cơ sở khác (trước đây `place_id` trong body chỉ được kiểm tra "có tồn tại
 * không", xem ghi chú ở `media.dto.ts`).
 *
 * `Media.Upload.Managed` là quyền ĐÃ CÓ SẴN từ SeedPlacePermissions (cấp cho `business_manager`,
 * và `business_owner` kế thừa qua DAG vai trò) — milestone này KHÔNG tạo quyền mới nào.
 *
 * Vòng đời: upload → `pending` → moderator duyệt/từ chối. KHÔNG có nhánh nào tự công khai.
 */
@Controller('places/:placeId/media')
export class PlaceMediaController {
  constructor(private readonly mediaService: MediaService) {}

  /** Ảnh của cơ sở cho màn hình quản lý — MỌI trạng thái (chủ cơ sở phải thấy ảnh đang chờ duyệt). */
  @Get()
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  list(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.mediaService.listForPlaceOwner(placeId);
  }

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: PresignMediaDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.mediaService.presignForPlace(dto, user.sub, placeId);
  }

  /**
   * Đăng ký ảnh sau khi PUT lên object storage xong. Ảnh vào `pending` VÀ được đưa vào hàng chờ
   * kiểm duyệt trong cùng transaction (xem `MediaService.register`).
   *
   * Cơ sở đích KHÔNG lấy từ body mà từ phiên presign (đã khoá `placeId` từ lúc kiểm tra quyền) —
   * route param ở đây chỉ dùng để cưỡng chế quyền, nên kể cả khi client gọi register với một
   * `placeId` khác trên path, ảnh vẫn gắn vào đúng cơ sở của phiên presign, và path đó lại phải
   * qua kiểm tra quyền của chính nó.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(
    @Param('placeId', ParseUUIDPipe) _placeId: string,
    @Body() dto: CreateMediaDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.mediaService.register(dto, user.sub);
  }

  /**
   * Phục vụ file cho CHỦ CƠ SỞ ở mọi trạng thái (302 tới signed URL ngắn hạn — cùng cơ chế endpoint
   * công khai, KHÔNG stream bytes qua API). Cần thiết vì ảnh `pending`/`rejected` không có URL công
   * khai nào, mà chủ cơ sở vẫn phải nhìn thấy ảnh mình vừa gửi.
   *
   * Hai lớp kiểm tra: quyền trên cơ sở (guard) VÀ ảnh phải thuộc đúng cơ sở đó (`belongsToPlace`) —
   * lớp thứ hai chặn việc mượn một placeId mình có quyền để đọc ảnh của cơ sở khác.
   */
  @Get(':mediaId/file')
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async file(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!(await this.mediaService.belongsToPlace(placeId, mediaId))) {
      throw new NotFoundException('Không tìm thấy ảnh của cơ sở này');
    }
    const signedUrl = await this.mediaService.resolveInternalFileUrl(mediaId);
    // `private` + nửa TTL: giống endpoint công khai — signed URL là capability dạng bearer, không
    // được chia sẻ qua proxy/CDN, và cache không bao giờ sống lâu hơn chính URL nó chứa.
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.mediaService.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async remove(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.mediaService.removeFromPlace(placeId, mediaId, user.sub);
    return null;
  }
}
