import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { ModerationController } from './moderation.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Controller mỏng (chỉ uỷ quyền) — cùng khuôn MediaController/BookingsController spec: giá trị
// kiểm thử nằm ở METADATA của decorator, nơi ranh giới bảo mật thực sự được khai báo. JwtAuthGuard
// + PermissionsGuard đã global (AuthModule) nên KHÔNG cần dựng cả module để kiểm chứng quyền.
type Handler = keyof ModerationController;

function handlerOf(name: Handler): object {
  return ModerationController.prototype[name] as unknown as object;
}

describe('ModerationController — ranh giới đặc quyền', () => {
  it('list yêu cầu Moderation.Queue.View', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('list'))).toEqual(['Moderation.Queue.View']);
  });

  it('list giới hạn 120 request/phút (M2)', () => {
    const target = handlerOf('list');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(120);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  it('getById yêu cầu Moderation.Queue.View', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('getById'))).toEqual(['Moderation.Queue.View']);
  });

  it('decide yêu cầu Media.Moderate (KHÔNG phải Moderation.Queue.View — đọc và quyết định là hai quyền khác nhau)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('decide'))).toEqual(['Media.Moderate']);
  });

  it('decide giới hạn 60 request/phút (đặc quyền hơn đọc hàng chờ, theo khuôn MediaController presign/register)', () => {
    const target = handlerOf('decide');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(60);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });
});
