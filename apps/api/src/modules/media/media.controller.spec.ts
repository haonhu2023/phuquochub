import { NotFoundException } from '@nestjs/common';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { MediaController } from './media.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import type { MediaService } from './media.service';

// Controller mỏng (chỉ uỷ quyền) — cùng khuôn AvailabilityController/BookingsController spec: giá
// trị kiểm thử nằm ở METADATA của decorator, nơi ranh giới bảo mật thực sự được khai báo.
type Handler = keyof MediaController;

function handlerOf(name: Handler): object {
  return MediaController.prototype[name] as unknown as object;
}

describe('MediaController — ranh giới đặc quyền', () => {
  it('presign yêu cầu Media.Upload.Own', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('presign'))).toEqual(['Media.Upload.Own']);
  });

  it('presign giới hạn 10 request/phút (design review §5)', () => {
    const target = handlerOf('presign');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(10);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  it('register yêu cầu Media.Upload.Own', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('register'))).toEqual(['Media.Upload.Own']);
  });

  it('report yêu cầu Report.Create (M5, WF-12 — khác Media.Upload.Own)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('report'))).toEqual(['Report.Create']);
  });

  it('report giới hạn 5 request/phút (moderation-design.md §8.2)', () => {
    const target = handlerOf('report');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(5);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  // Secure Private Media (2026-08-10) — GET /media/{id}/file.
  describe('file (GET /media/{id}/file)', () => {
    it('CÔNG KHAI có chủ ý (@Public) — khách chưa đăng nhập vẫn xem được ảnh review/gallery', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf('file'))).toBe(true);
    });

    it('KHÔNG yêu cầu permission nào (khác presign/register/report)', () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('file'))).toBeUndefined();
    });

    it('có throttle riêng — một trang nhiều ảnh vẫn hợp lệ nhưng không cho phép quét không giới hạn', () => {
      const target = handlerOf('file');
      expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(120);
      expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
    });
  });

  // Hành vi runtime của handler (tách khỏi metadata ở trên): redirect thật, không stream bytes.
  describe('file — hành vi', () => {
    const MEDIA_ID = '43ac8a28-a2ed-4076-995c-8536f365f13e';

    function makeRes() {
      return { setHeader: jest.fn(), redirect: jest.fn() };
    }

    it('media published → 302 tới signed URL, KHÔNG stream bytes qua Nest', async () => {
      const service = {
        resolveFileUrl: jest.fn().mockResolvedValue('https://signed.example/media/abc.jpg?sig=1'),
        fileUrlTtl: 300,
      } as unknown as MediaService;
      const controller = new MediaController(service);
      const res = makeRes();

      await controller.file(MEDIA_ID, res as never);

      expect(service.resolveFileUrl).toHaveBeenCalledWith(MEDIA_ID);
      expect(res.redirect).toHaveBeenCalledWith(302, 'https://signed.example/media/abc.jpg?sig=1');
      // `send`/`json`/`pipe` không tồn tại trên res giả — nếu handler cố stream, test sẽ ném lỗi.
    });

    it('Cache-Control là private và KHÔNG BAO GIỜ sống lâu hơn signed URL', async () => {
      const service = {
        resolveFileUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
        fileUrlTtl: 300,
      } as unknown as MediaService;
      const controller = new MediaController(service);
      const res = makeRes();

      await controller.file(MEDIA_ID, res as never);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=150');
    });

    it('service ném NotFound (pending/hidden/rejected/đã xoá/không tồn tại) → KHÔNG redirect, lỗi nổi lên filter', async () => {
      const service = {
        resolveFileUrl: jest.fn().mockRejectedValue(new NotFoundException('Không tìm thấy media')),
        fileUrlTtl: 300,
      } as unknown as MediaService;
      const controller = new MediaController(service);
      const res = makeRes();

      await expect(controller.file(MEDIA_ID, res as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });
});
