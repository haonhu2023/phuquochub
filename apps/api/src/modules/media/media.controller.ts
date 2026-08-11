import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PRINCIPAL_RESOLVER } from '../authz/resolvers/principal.resolver';
import { Public } from '../authz/decorators/public.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { CreateMediaDto, PresignMediaDto } from './dto/media.dto';
import { CreateReportDto } from '../moderation/dto/moderation.dto';

// Media Upload Foundation (design review, 2026-07-30). Backend-only — no frontend upload UI in
// this milestone. See docs/data/modules/media.md.
// /media/{id}/report (M5, WF-12) — Report.Create, throttle 5/phút (moderation-design.md §8.2).
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  @AuthorizationContext({
    resourceType: 'media',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(@Body() dto: PresignMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.presign(dto, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  @AuthorizationContext({
    resourceType: 'media',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  register(@Body() dto: CreateMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.register(dto, user.sub);
  }

  /**
   * Secure Private Media (2026-08-10) — điểm phát media DUY NHẤT ra công chúng.
   *
   * Công khai (`@Public()`) một cách CÓ CHỦ Ý: ảnh trong review/gallery phải hiển thị cho khách
   * chưa đăng nhập, y như trước. Cái đổi không phải là "ai xem được", mà là "xem được CÁI GÌ":
   * trước đây bucket mở anonymous read cho mọi object (kể cả pending/hidden/rejected, và kèm cả
   * quyền liệt kê toàn bucket); giờ chỉ những media THỰC SỰ published mới phân giải được, và mỗi
   * lần tải đều kiểm tra lại trạng thái publish hiện tại.
   *
   * 302 chứ KHÔNG stream bytes qua Nest (yêu cầu thiết kế): API chỉ cấp phép rồi đứng ra ngoài
   * đường truyền — không tốn băng thông/bộ nhớ API cho mỗi ảnh, và giữ nguyên khả năng đặt CDN
   * trước object storage sau này.
   *
   * `@Res()` (không passthrough) nên TransformInterceptor không bọc envelope `{success,data}` —
   * trình duyệt cần một redirect thật cho `<img src>`, không phải JSON. Nhánh 404 vẫn ném
   * NotFoundException BÌNH THƯỜNG trước khi chạm `res`, nên lỗi vẫn đi qua AllExceptionsFilter và
   * giữ đúng hình dạng envelope lỗi như mọi endpoint khác.
   *
   * `Cache-Control: private, max-age=<nửa TTL>`: cho trình duyệt tái dùng redirect trong thời gian
   * signed URL chắc chắn còn hiệu lực, nhưng KHÔNG cho proxy/CDN dùng chung (`private`) — một
   * signed URL là capability dạng bearer, không được chia sẻ giữa người dùng. Nửa TTL để một
   * response nằm sẵn trong cache không bao giờ trỏ tới URL vừa hết hạn.
   */
  @Get(':id/file')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const signedUrl = await this.mediaService.resolveFileUrl(id);
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.mediaService.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }

  /**
   * Owner Place Photos — kênh xem ảnh CHO MODERATOR, ở BẤT KỲ trạng thái nào (302 tới signed URL
   * ngắn hạn, không stream bytes qua API).
   *
   * KHÔNG `@Public()` (khác hẳn `:id/file`): gác bằng `Media.Moderate` — đúng quyền mà
   * `ModerationService.decide()` đòi cho một quyết định trên media, nên ai duyệt được ảnh thì mới
   * xem được ảnh. Đây là thứ đóng lại giới hạn từng ghi ở `moderation-target-preview.ts` ("không
   * có URL xem trước cho media chờ duyệt"): trước đây moderator phải quyết định mà không nhìn thấy
   * bức ảnh, điều vô nghĩa với kiểm duyệt ảnh.
   *
   * Endpoint công khai `:id/file` KHÔNG bị nới lỏng một chút nào — nó vẫn chỉ phục vụ `published`.
   */
  @Get(':id/moderation-file')
  @RequirePermissions('Media.Moderate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async moderationFile(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const signedUrl = await this.mediaService.resolveInternalFileUrl(id);
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(this.mediaService.fileUrlTtl / 2)}`);
    res.redirect(HttpStatus.FOUND, signedUrl);
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Report.Create')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.mediaService.report(id, dto, user.sub);
    return null;
  }
}
