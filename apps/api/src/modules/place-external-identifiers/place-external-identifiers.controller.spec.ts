import { PlaceExternalIdentifiersController } from './place-external-identifiers.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Cùng khuôn places.controller.spec.ts: controller mỏng, giá trị kiểm thử nằm ở METADATA của
// decorator (khoá lấy từ chính decorator export, không chép lại chuỗi). Chứng minh guard THỰC SỰ
// enforce (không chỉ khai báo) là việc của e2e spec riêng (xem place-external-identifiers-authz.e2e-spec.ts),
// cùng lý do places-preview-authz.e2e-spec.ts tồn tại song song với file này.
type Handler = keyof PlaceExternalIdentifiersController;

function handlerOf(name: Handler): object {
  return PlaceExternalIdentifiersController.prototype[name] as unknown as object;
}

function isPublic(name: Handler): boolean {
  return Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf(name)) === true;
}

function permissionsOf(name: Handler): string[] | undefined {
  return Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(name)) as string[] | undefined;
}

const ROUTES: Handler[] = ['list', 'upsertGooglePlaceId'];

describe('PlaceExternalIdentifiersController — ranh giới quyền', () => {
  it.each(ROUTES)('`%s` KHÔNG công khai — dashboard-only', (name) => {
    expect(isPublic(name)).toBe(false);
  });

  it.each(ROUTES)('`%s` yêu cầu đúng permission Place.Edit.Managed (cùng quyền với sửa place đó)', (name) => {
    expect(permissionsOf(name)).toEqual(['Place.Edit.Managed']);
  });
});
