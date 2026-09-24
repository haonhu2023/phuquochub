import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { PlaceSuggestionsController } from './place-suggestions.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Controller mỏng (chỉ uỷ quyền) — cùng khuôn ModerationController spec: giá trị kiểm thử nằm ở
// METADATA của decorator, nơi ranh giới bảo mật thực sự được khai báo. JwtAuthGuard đã global.
type Handler = keyof PlaceSuggestionsController;

function handlerOf(name: Handler): object {
  return PlaceSuggestionsController.prototype[name] as unknown as object;
}

describe('PlaceSuggestionsController — ranh giới đặc quyền', () => {
  it('create yêu cầu Report.Create (member — mọi tài khoản đã đăng nhập, cùng /reviews/:id/report)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('create'))).toEqual(['Report.Create']);
  });

  it('create giới hạn 5 request/phút (cùng chính sách /reviews/:id/report)', () => {
    const target = handlerOf('create');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(5);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  it('listForPlace KHÔNG có @RequirePermissions tĩnh — quyền khoanh vùng theo place chạy trong service.listForPlace() (Place.Approve HOẶC Place.Edit.Managed cho đúng place đó), không phải PermissionsGuard tĩnh', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('listForPlace'))).toBeUndefined();
  });

  it('listPending yêu cầu Place.Approve (worklist toàn cục)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('listPending'))).toEqual(['Place.Approve']);
  });

  it('resolve KHÔNG có @RequirePermissions tĩnh — cùng lý do listForPlace, quyền chạy trong service.resolve()', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('resolve'))).toBeUndefined();
  });
});
