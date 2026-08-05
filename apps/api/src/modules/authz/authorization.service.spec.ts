import { AuthorizationService } from './authorization.service';
import type { ScopedGrant } from './scoped-grant';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// PDP: gom role (trực tiếp + kế thừa DAG) → hợp nhất permission → deny-by-default. ADR-019 M0.1 —
// AuthorizationService giờ nạp qua MỘT truy vấn (`getScopedGrants`, đã kiểm chứng riêng ở
// user-roles.repository.spec.ts + authz-scoped-grants.e2e-spec.ts đối với real Postgres); ở đây
// chỉ mock trực tiếp UserRolesRepository — logic khớp permission/scope đã test độc lập ở
// scoped-authorization.util.spec.ts. `RolesRepository` không còn là dependency của service này
// (không còn dùng — expandWithAncestors/getPermissionsForRoles vẫn còn trong RolesRepository,
// không xoá, chỉ không còn được gọi từ đây).
function grant(overrides: Partial<ScopedGrant> = {}): ScopedGrant {
  return { code: 'Category.Manage', effect: 'allow', scopeType: 'global', businessId: null, ...overrides };
}

describe('AuthorizationService (PDP)', () => {
  type Deps = ConstructorParameters<typeof AuthorizationService>;
  let userRolesRepo: LooseMock<Deps[0]>;
  let service: AuthorizationService;

  beforeEach(() => {
    userRolesRepo = createMock<Deps[0]>({ getScopedGrants: jest.fn() });
    service = new AuthorizationService(userRolesRepo);
  });

  afterEach(() => jest.clearAllMocks());

  it('getEffectivePermissions: tách allow/deny từ ScopedGrant, giữ nguyên hình dạng {allow,deny}', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.View', effect: 'allow' }),
      grant({ code: 'Category.Manage', effect: 'deny' }),
    ]);

    const eff = await service.getEffectivePermissions('u1');

    expect(userRolesRepo.getScopedGrants).toHaveBeenCalledWith('u1');
    expect(eff.allow).toEqual(['Place.View']);
    expect(eff.deny).toEqual(['Category.Manage']);
  });

  it('can: có allow khớp (scope-less) → true, KHÔNG cần contextProvider', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([grant({ code: 'Category.Manage', effect: 'allow' })]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(true);
  });

  it('can: không có permission phù hợp → false (deny-by-default)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(false);
  });

  it('can: explicit deny thắng cả wildcard allow → false', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: '*', effect: 'allow' }),
      grant({ code: 'Category.Manage', effect: 'deny' }),
    ]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(false);
  });

  it('can: grant Managed KHÔNG kèm contextProvider → đường TƯƠNG THÍCH, hạng scope thuần (isAllowed) — ĐÚNG hành vi trước ADR-019, KHÔNG đổi', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
    ]);

    await expect(service.can('u1', 'Place.Edit.Managed')).resolves.toBe(true);
  });

  it('can: grant .Own KHÔNG kèm contextProvider → đường TƯƠNG THÍCH, allow (regression thật đã bắt được lúc triển khai: Media.Upload.Own/User.Edit.Own đang SỐNG, PermissionsGuard/M0.2 chưa đấu nối context)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Media.Upload.Own', effect: 'allow', scopeType: 'global', businessId: null }),
    ]);

    await expect(service.can('u1', 'Media.Upload.Own')).resolves.toBe(true);
  });

  it('can: grant Managed KHÔNG khớp permission được yêu cầu (hạng/base khác) → false kể cả không có context (đường tương thích vẫn deny-by-default đúng)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Review.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
    ]);

    await expect(service.can('u1', 'Place.Edit.Managed')).resolves.toBe(false);
  });

  it('can: grant Managed KÈM contextProvider khớp businessId → true (đường MỚI, D2/D6, chỉ kích hoạt khi caller chủ động truyền context)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
    ]);
    const provider = jest.fn().mockResolvedValue({
      resourceType: 'place',
      resourceId: 'place-A',
      businessId: 'place-A',
      ownerId: null,
    });

    await expect(service.can('u1', 'Place.Edit.Managed', provider)).resolves.toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('can: grant Managed KÈM contextProvider nhưng businessId KHÁC → false (đường MỚI thật sự fail-closed khi được kích hoạt)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
    ]);
    const provider = jest.fn().mockResolvedValue({
      resourceType: 'place',
      resourceId: 'place-B',
      businessId: 'place-B',
      ownerId: null,
    });

    await expect(service.can('u1', 'Place.Edit.Managed', provider)).resolves.toBe(false);
  });

  it('can: grant Any vẫn allow tức thời dù có truyền contextProvider — provider KHÔNG bị gọi (đường nhanh, D2 bước 3)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([grant({ code: 'Place.Edit.Any', effect: 'allow' })]);
    const provider = jest.fn();

    await expect(service.can('u1', 'Place.Edit.Managed', provider)).resolves.toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it('getScopedGrants được gọi ĐÚNG MỘT LẦN cho mỗi lời gọi can()/getEffectivePermissions() (không khuếch đại truy vấn)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([]);

    await service.can('u1', 'Category.Manage');
    expect(userRolesRepo.getScopedGrants).toHaveBeenCalledTimes(1);

    await service.getEffectivePermissions('u1');
    expect(userRolesRepo.getScopedGrants).toHaveBeenCalledTimes(2);
  });

  describe('canWithGrants (ADR-019 D11 — nhận grants đã nạp sẵn, cho PermissionsGuard tái dùng)', () => {
    it('KHÔNG gọi getScopedGrants — hoàn toàn không chạm repository', async () => {
      const grants = [grant({ code: 'Category.Manage', effect: 'allow' })];
      await service.canWithGrants(grants, 'u1', 'Category.Manage');
      expect(userRolesRepo.getScopedGrants).not.toHaveBeenCalled();
    });

    it('không kèm contextProvider -> đúng hành vi rank-thuần isAllowed (giống can())', async () => {
      const grants = [
        grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
      ];
      await expect(service.canWithGrants(grants, 'u1', 'Place.Edit.Managed')).resolves.toBe(true);
    });

    it('kèm contextProvider, businessId khớp -> true; khác -> false (cùng logic evaluateScopedAccess)', async () => {
      const grants = [
        grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' }),
      ];
      const matching = jest.fn().mockResolvedValue({
        resourceType: 'place',
        resourceId: 'place-A',
        businessId: 'place-A',
        ownerId: null,
      });
      const mismatching = jest.fn().mockResolvedValue({
        resourceType: 'place',
        resourceId: 'place-B',
        businessId: 'place-B',
        ownerId: null,
      });

      await expect(service.canWithGrants(grants, 'u1', 'Place.Edit.Managed', matching)).resolves.toBe(true);
      await expect(service.canWithGrants(grants, 'u1', 'Place.Edit.Managed', mismatching)).resolves.toBe(false);
    });

    it('cho cùng grants, can() và canWithGrants(grants,...) cho ra ĐÚNG kết quả giống nhau', async () => {
      const grants = [grant({ code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A' })];
      userRolesRepo.getScopedGrants.mockResolvedValue(grants);

      const viaCan = await service.can('u1', 'Place.Edit.Managed');
      const viaGrants = await service.canWithGrants(grants, 'u1', 'Place.Edit.Managed');

      expect(viaGrants).toBe(viaCan);
    });
  });
});
