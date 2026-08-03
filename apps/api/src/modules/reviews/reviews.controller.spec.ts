import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { ReviewsController } from './reviews.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';

// Controller mỏng (chỉ uỷ quyền) — cùng khuôn MediaController/ModerationController spec: giá trị
// kiểm thử nằm ở METADATA của decorator, nơi ranh giới bảo mật thực sự được khai báo.
type Handler = keyof ReviewsController;

function handlerOf(name: Handler): object {
  return ReviewsController.prototype[name] as unknown as object;
}

describe('ReviewsController — ranh giới đặc quyền', () => {
  it('list là route công khai (@Public)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf('list'))).toBe(true);
  });

  it('create yêu cầu Review.Create', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('create'))).toEqual(['Review.Create']);
  });

  it('report yêu cầu Report.Create (M5, WF-12 — khác Review.Create)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('report'))).toEqual(['Report.Create']);
  });

  it('report giới hạn 5 request/phút (moderation-design.md §8.2)', () => {
    const target = handlerOf('report');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(5);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });
});
