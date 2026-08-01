import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { MediaController } from './media.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

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
});
