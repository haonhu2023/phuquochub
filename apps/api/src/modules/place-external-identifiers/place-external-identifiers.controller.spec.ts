import { PlaceExternalIdentifiersController } from './place-external-identifiers.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { AUTHZ_CONTEXT_KEY } from '../authz/authorization-context';

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

function hasAuthzContext(name: Handler): boolean {
  return Reflect.getMetadata(AUTHZ_CONTEXT_KEY, handlerOf(name)) !== undefined;
}

const ALL_ROUTES: Handler[] = ['list', 'upsertGooglePlaceId', 'confirmGooglePlaceId', 'revokeGooglePlaceIdVerification'];
// Nhập/đề xuất ID — quyền THEO RECORD, cùng Place.Edit.Managed với mọi route sửa place khác.
const MANAGED_ROUTES: Handler[] = ['list', 'upsertGooglePlaceId'];
// Xác nhận/thu hồi — quyền TOÀN CỤC, KHÁC Place.Edit.Managed (2026-10-16, migration 1720009100000).
const VERIFY_ROUTES: Handler[] = ['confirmGooglePlaceId', 'revokeGooglePlaceIdVerification'];

describe('PlaceExternalIdentifiersController — ranh giới quyền', () => {
  it.each(ALL_ROUTES)('`%s` KHÔNG công khai — dashboard-only', (name) => {
    expect(isPublic(name)).toBe(false);
  });

  it.each(MANAGED_ROUTES)('`%s` yêu cầu Place.Edit.Managed theo record (:id) — cùng quyền sửa place đó', (name) => {
    expect(permissionsOf(name)).toEqual(['Place.Edit.Managed']);
    expect(hasAuthzContext(name)).toBe(true);
  });

  it.each(VERIFY_ROUTES)(
    '`%s` yêu cầu PlaceExternalIdentifier.Verify — quyền RIÊNG, KHÁC Place.Edit.Managed, KHÔNG scoped theo record',
    (name) => {
      expect(permissionsOf(name)).toEqual(['PlaceExternalIdentifier.Verify']);
      // Cố ý KHÔNG AuthorizationContext: ai giữ quyền này xác nhận được MỌI place, không giới hạn
      // "place họ quản lý" — giống Place.Approve/Price.Verify (toàn cục, không theo :id).
      expect(hasAuthzContext(name)).toBe(false);
    },
  );

  it('upsertGooglePlaceId và confirmGooglePlaceId KHÔNG dùng chung một permission (người nhập ID không tự xác nhận được)', () => {
    expect(permissionsOf('upsertGooglePlaceId')).not.toEqual(permissionsOf('confirmGooglePlaceId'));
  });
});
