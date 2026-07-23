import { AuthorizationService } from './authorization.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// PDP: gom role (trực tiếp + kế thừa DAG) → hợp nhất permission → deny-by-default.
// Mock repository để test thuần quyết định (logic khớp permission đã test ở authorization.util.spec).
describe('AuthorizationService (PDP)', () => {
  type Deps = ConstructorParameters<typeof AuthorizationService>;
  let userRolesRepo: LooseMock<Deps[0]>;
  let rolesRepo: LooseMock<Deps[1]>;
  let service: AuthorizationService;

  beforeEach(() => {
    userRolesRepo = createMock<Deps[0]>({ findActiveRoleIds: jest.fn() });
    rolesRepo = createMock<Deps[1]>({ expandWithAncestors: jest.fn(), getPermissionsForRoles: jest.fn() });
    service = new AuthorizationService(userRolesRepo, rolesRepo);
  });

  afterEach(() => jest.clearAllMocks());

  it('getEffectivePermissions: mở rộng role kế thừa rồi tách allow/deny', async () => {
    userRolesRepo.findActiveRoleIds.mockResolvedValue(['r-member']);
    rolesRepo.expandWithAncestors.mockResolvedValue(['r-member', 'r-guest']);
    rolesRepo.getPermissionsForRoles.mockResolvedValue([
      { code: 'Place.View', effect: 'allow' },
      { code: 'Category.Manage', effect: 'deny' },
    ]);

    const eff = await service.getEffectivePermissions('u1');

    expect(rolesRepo.expandWithAncestors).toHaveBeenCalledWith(['r-member']);
    expect(rolesRepo.getPermissionsForRoles).toHaveBeenCalledWith(['r-member', 'r-guest']);
    expect(eff.allow).toEqual(['Place.View']);
    expect(eff.deny).toEqual(['Category.Manage']);
  });

  it('can: có allow khớp → true', async () => {
    userRolesRepo.findActiveRoleIds.mockResolvedValue(['r']);
    rolesRepo.expandWithAncestors.mockResolvedValue(['r']);
    rolesRepo.getPermissionsForRoles.mockResolvedValue([{ code: 'Category.Manage', effect: 'allow' }]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(true);
  });

  it('can: không có permission phù hợp → false (deny-by-default)', async () => {
    userRolesRepo.findActiveRoleIds.mockResolvedValue([]);
    rolesRepo.expandWithAncestors.mockResolvedValue([]);
    rolesRepo.getPermissionsForRoles.mockResolvedValue([]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(false);
  });

  it('can: explicit deny thắng cả wildcard allow → false', async () => {
    userRolesRepo.findActiveRoleIds.mockResolvedValue(['r']);
    rolesRepo.expandWithAncestors.mockResolvedValue(['r']);
    rolesRepo.getPermissionsForRoles.mockResolvedValue([
      { code: '*', effect: 'allow' },
      { code: 'Category.Manage', effect: 'deny' },
    ]);

    await expect(service.can('u1', 'Category.Manage')).resolves.toBe(false);
  });
});
