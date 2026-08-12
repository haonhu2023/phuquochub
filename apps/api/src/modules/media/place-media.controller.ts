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
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { MediaService } from './media.service';
import {
  CreateMediaDto,
  PresignMediaDto,
  ReorderPlaceMediaDto,
  SetPlaceCoverDto,
  UpdatePlaceMediaMetadataDto,
} from './dto/media.dto';

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
   * Sắp xếp lại ảnh của cơ sở (Owner Cover & Photo Ordering, 2026-08-12).
   *
   * `order` là một đoạn path CỐ ĐỊNH nên không đụng route nào theo `:mediaId` (và hai route đó
   * dùng phương thức HTTP khác hẳn). Body CHỈ có `media_ids` — cơ sở đích vẫn là route param đã
   * qua guard, đúng nguyên tắc "id mà guard cho phép chính là id service dùng".
   *
   * Trả về danh sách ảnh SAU KHI sắp (cùng hình dạng `GET`), để client không phải gọi thêm một
   * vòng và luôn nhìn thấy đúng thứ tự chuẩn do server quyết định.
   */
  @Patch('order')
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  reorder(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: ReorderPlaceMediaDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.mediaService.reorderPlaceMedia(placeId, dto.media_ids, user.sub);
  }

  /**
   * Chọn ảnh bìa cho cơ sở. Client gửi MEDIA ID, KHÔNG BAO GIỜ gửi URL: một URL do client cung cấp
   * là dữ liệu không kiểm chứng được (có thể trỏ ra ngoài, có thể là presigned URL sắp hết hạn),
   * còn media id thì kiểm được đầy đủ tư cách (thuộc đúng cơ sở, đã duyệt) ngay trong câu UPDATE.
   * Giá trị lưu là `places.cover_image_id`; URL công khai được SINH lúc đọc, không lưu.
   */
  @Patch('cover')
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  setCover(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: SetPlaceCoverDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.mediaService.setPlaceCover(placeId, dto.media_id, user.sub);
  }

  /**
   * Sửa caption/alt_text của MỘT ảnh (Owner Photo Metadata, 2026-08-12).
   *
   * ĐẶT SAU `PATCH 'order'`/`PATCH 'cover'` trong khai báo — Nest/Express khớp route THEO THỨ TỰ
   * ĐĂNG KÝ cho cùng phương thức HTTP, nên nếu route `:mediaId` này đứng TRƯỚC hai route tĩnh kia,
   * một request `PATCH /places/{id}/media/order` sẽ bị nuốt nhầm thành `mediaId="order"` (rồi
   * `ParseUUIDPipe` mới chặn ở bước sau — sai tầng, sai mã lỗi). Thứ tự hiện tại (`order`, `cover`,
   * rồi `:mediaId`) đảm bảo hai đoạn path cố định luôn được khớp trước.
   *
   * KHÔNG chạm status/sort_order/cover — chỉ hai trường DTO khai báo (caption/alt_text) được ghi,
   * xem `MediaService.updatePlaceMediaMetadata`.
   */
  @Patch(':mediaId')
  @RequirePermissions('Media.Upload.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'placeId' } })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  updateMetadata(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdatePlaceMediaMetadataDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.mediaService.updatePlaceMediaMetadata(placeId, mediaId, dto, user.sub);
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
