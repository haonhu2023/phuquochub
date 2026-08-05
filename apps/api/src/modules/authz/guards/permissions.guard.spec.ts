import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AuthorizationService } from '../authorization.service';
import { UserRolesRepository } from '../../rbac/repositories/user-roles.repository';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { AuthorizationContext } from '../decorators/authorization-context.decorator';
import { IDENTITY_PLACE_RESOLVER } from '../resolvers/identity-place.resolver';
import { PRINCIPAL_RESOLVER } from '../resolvers/principal.resolver';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';
import type { ScopedGrant } from '../scoped-grant';

// ADR-019 M0.2 — PermissionsGuard là PEP; AuthorizationService (RÊAL instance, không mock quyết
// định) là PDP duy nhất (D1) — guard test dùng AuthorizationService THẬT (chỉ mock
// UserRolesRepository/ModuleRef, những dependency I/O) để không nhân bản logic quyết định
// scoped-authorization.util.spec.ts đã bao phủ; ở đây CHỈ kiểm PEP wiring (metadata → grants →
// contextProvider → 403).
const TEST_RESOLVER = Symbol('TEST_RESOLVER');

const RESOURCE_ID = 'place-A';
const OTHER_BUSINESS_ID = 'place-B';

class FixtureController {
  @RequirePermissions('Category.Manage')
  scopeless(): void {
    /* noop */
  }

  // M0.3: route .Own THIẾU @AuthorizationContext — nay PHẢI deny (INV-A1 mở rộng sang Own). Đây là
  // fixture cố ý mô phỏng một route Own quên gắn decorator (lỗi cấu hình), KHÔNG phải trạng thái
  // sống hợp lệ nào — cả 3 handler .Own thật (Media.Upload.Own × 2, User.Edit.Own) đều mang
  // @AuthorizationContext sau M0.3 (xem ownWithPrincipalContext bên dưới).
  @RequirePermissions('Media.Upload.Own')
  ownMissingContext(): void {
    /* noop — cố ý thiếu @AuthorizationContext, cho test INV-A1 mở rộng sang Own */
  }

  // M0.3: route .Own THẬT, đúng hình dạng rollout (D16) — principal + PRINCIPAL_RESOLVER.
  @RequirePermissions('User.Edit.Own')
  @AuthorizationContext({
    resourceType: 'user',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  ownWithPrincipalContext(): void {
    /* noop */
  }

  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  managedIdentity(): void {
    /* noop */
  }

  @RequirePermissions('Place.Edit.Managed')
  managedWithoutContext(): void {
    /* noop — thiếu @AuthorizationContext, cố ý cho test INV-A1 */
  }

  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'missingParam' } })
  managedMissingParam(): void {
    /* noop — param 'missingParam' cố ý không tồn tại trong request.params */
  }

  @RequirePermissions('Contact.Edit.Managed')
  @AuthorizationContext({
    resourceType: 'contact',
    resource: { from: 'param', name: 'id' },
    resolver: TEST_RESOLVER,
  })
  managedWithTokenResolver(): void {
    /* noop */
  }

  @RequirePermissions('Contact.Edit.Managed', 'Contact.Edit.Managed')
  @AuthorizationContext({
    resourceType: 'contact',
    resource: { from: 'param', name: 'id' },
    resolver: TEST_RESOLVER,
  })
  managedTwoPermsSameContext(): void {
    /* noop — 2 permission, CÙNG một @AuthorizationContext, để test memo resolver 1 lần */
  }
}

function grant(overrides: Partial<ScopedGrant> = {}): ScopedGrant {
  return { code: 'Category.Manage', effect: 'allow', scopeType: 'global', businessId: null, ...overrides };
}

function buildContext(
  handlerName: keyof FixtureController,
  request: { params?: Record<string, string>; user?: { sub: string } | undefined },
): ExecutionContext {
  const handler = FixtureController.prototype[handlerName];
  const req = { params: request.params ?? {}, user: request.user };
  return {
    getHandler: () => handler,
    getClass: () => FixtureController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard (ADR-019 M0.2 — PEP)', () => {
  let userRolesRepo: LooseMock<UserRolesRepository>;
  let moduleRef: LooseMock<{ get: (...args: unknown[]) => unknown }>;
  let authz: AuthorizationService;
  let guard: PermissionsGuard;

  beforeEach(() => {
    userRolesRepo = createMock<UserRolesRepository>({ getScopedGrants: jest.fn() });
    moduleRef = createMock<{ get: (...args: unknown[]) => unknown }>({ get: jest.fn() });
    authz = new AuthorizationService(userRolesRepo);
    guard = new PermissionsGuard(
      new Reflector(),
      authz,
      userRolesRepo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      moduleRef as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('endpoint không khai báo permission -> pass, KHÔNG tải grants', async () => {
    class Public {
      handler(): void {
        /* noop */
      }
    }
    const context = {
      getHandler: () => Public.prototype.handler,
      getClass: () => Public,
      switchToHttp: () => ({ getRequest: () => ({ params: {}, user: { sub: 'u1' } }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(userRolesRepo.getScopedGrants).not.toHaveBeenCalled();
  });

  it('chưa đăng nhập (không có user.sub) -> UnauthorizedException', async () => {
    const context = buildContext('scopeless', { user: undefined });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Any/wildcard fast path: grant "*" thỏa -> allow, moduleRef.get KHÔNG được gọi (D2 bước 3)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([grant({ code: '*' })]);
    const context = buildContext('managedIdentity', { params: { id: RESOURCE_ID }, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(moduleRef.get).not.toHaveBeenCalled();
  });

  it('ScopedGrant chỉ được nạp ĐÚNG MỘT LẦN dù handler yêu cầu NHIỀU permission (D11)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([grant({ code: '*' })]);
    const context = buildContext('managedTwoPermsSameContext', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await guard.canActivate(context);
    expect(userRolesRepo.getScopedGrants).toHaveBeenCalledTimes(1);
  });

  it('thiếu @AuthorizationContext metadata cho permission Managed -> deny (INV-A1)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    const context = buildContext('managedWithoutContext', { params: { id: RESOURCE_ID }, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).rejects.toThrow('Thiếu quyền: Place.Edit.Managed');
  });

  it('thiếu route param khai báo trong @AuthorizationContext -> deny', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    const context = buildContext('managedMissingParam', { params: {}, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolver token KHÔNG đăng ký qua ModuleRef -> deny (INV-A2)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockImplementation(() => {
      throw new Error('UnknownElementException');
    });
    const context = buildContext('managedWithTokenResolver', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolver trả null -> deny (INV-A4)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockReturnValue({ resolve: jest.fn().mockResolvedValue(null) });
    const context = buildContext('managedWithTokenResolver', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolver ném lỗi -> deny, KHÔNG BAO GIỜ hiểu là pass (INV-A5)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockReturnValue({ resolve: jest.fn().mockRejectedValue(new Error('DB down')) });
    const context = buildContext('managedWithTokenResolver', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('businessId của grant KHỚP context đã phân giải -> allow', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockReturnValue({
      resolve: jest.fn().mockResolvedValue({
        resourceType: 'contact',
        resourceId: 'contact-1',
        businessId: RESOURCE_ID,
        ownerId: null,
      }),
    });
    const context = buildContext('managedWithTokenResolver', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('businessId của grant KHÁC context đã phân giải -> deny (cách ly cross-business)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockReturnValue({
      resolve: jest.fn().mockResolvedValue({
        resourceType: 'contact',
        resourceId: 'contact-1',
        businessId: OTHER_BUSINESS_ID,
        ownerId: null,
      }),
    });
    const context = buildContext('managedWithTokenResolver', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('thông điệp 403 ĐỒNG NHẤT bất kể lý do deny (D10 — không tiết lộ tồn tại tài nguyên)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    const missingMetaCtx = buildContext('managedWithoutContext', {
      params: { id: RESOURCE_ID },
      user: { sub: 'u1' },
    });
    const missingParamCtx = buildContext('managedMissingParam', {
      params: {},
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(missingMetaCtx)).rejects.toThrow('Thiếu quyền: Place.Edit.Managed');
    await expect(guard.canActivate(missingParamCtx)).rejects.toThrow('Thiếu quyền: Place.Edit.Managed');
  });

  it('resolver mặc định IDENTITY_PLACE_RESOLVER được dùng khi @AuthorizationContext không khai báo resolver', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    moduleRef.get.mockImplementation((token: symbol) => {
      if (token === IDENTITY_PLACE_RESOLVER) {
        return { resolve: jest.fn().mockResolvedValue({ resourceType: 'place', resourceId: RESOURCE_ID, businessId: RESOURCE_ID, ownerId: null }) };
      }
      throw new Error('unexpected token');
    });
    const context = buildContext('managedIdentity', { params: { id: RESOURCE_ID }, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(moduleRef.get).toHaveBeenCalledWith(IDENTITY_PLACE_RESOLVER, { strict: false });
  });

  it('kết quả resolver được GHI NHỚ trong CÙNG request — 2 permission cùng ngữ cảnh chỉ gọi resolve() một lần (D11)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Contact.Edit.Managed', scopeType: 'managed', businessId: RESOURCE_ID }),
    ]);
    const resolve = jest.fn().mockResolvedValue({
      resourceType: 'contact',
      resourceId: 'contact-1',
      businessId: RESOURCE_ID,
      ownerId: null,
    });
    moduleRef.get.mockReturnValue({ resolve });
    const context = buildContext('managedTwoPermsSameContext', {
      params: { id: 'contact-1' },
      user: { sub: 'u1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('M0.3: permission .Own THIẾU @AuthorizationContext -> deny (INV-A1 mở rộng sang Own, ngoại lệ M0.2 đã gỡ bỏ)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Media.Upload.Own', effect: 'allow', scopeType: 'own', businessId: null }),
    ]);
    const context = buildContext('ownMissingContext', { params: {}, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).rejects.toThrow('Thiếu quyền: Media.Upload.Own');
  });

  it('M0.3: permission .Own CÓ @AuthorizationContext (principal) -> contextProvider ĐƯỢC gọi (moduleRef.get invoked) — khác hẳn hành vi M0.2', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'User.Edit.Own', effect: 'allow', scopeType: 'own', businessId: null }),
    ]);
    moduleRef.get.mockReturnValue({
      resolve: jest.fn().mockResolvedValue({ resourceType: 'user', resourceId: 'u1', businessId: null, ownerId: 'u1' }),
    });
    const context = buildContext('ownWithPrincipalContext', { params: {}, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(moduleRef.get).toHaveBeenCalledWith(PRINCIPAL_RESOLVER, { strict: false });
  });

  it('M0.3: ownerId phân giải KHỚP userId gọi (principal luôn tự sở hữu) -> allow', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'User.Edit.Own', effect: 'allow', scopeType: 'own', businessId: null }),
    ]);
    moduleRef.get.mockReturnValue({
      resolve: jest.fn().mockResolvedValue({ resourceType: 'user', resourceId: 'u1', businessId: null, ownerId: 'u1' }),
    });
    const context = buildContext('ownWithPrincipalContext', { params: {}, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('M0.3: ownerId phân giải KHÁC userId gọi (danh tính owner bị giả mạo/resolver sai) -> deny', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'User.Edit.Own', effect: 'allow', scopeType: 'own', businessId: null }),
    ]);
    moduleRef.get.mockReturnValue({
      resolve: jest.fn().mockResolvedValue({ resourceType: 'user', resourceId: 'other-user', businessId: null, ownerId: 'other-user' }),
    });
    const context = buildContext('ownWithPrincipalContext', { params: {}, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('M0.3: grant .Own KHÔNG BAO GIỜ thỏa permission required .Managed (hạng 1 < 2, không đổi)', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([
      grant({ code: 'Place.Edit.Own', effect: 'allow', scopeType: 'own', businessId: null }),
    ]);
    const context = buildContext('managedIdentity', { params: { id: RESOURCE_ID }, user: { sub: 'u1' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hai lệnh gọi canActivate riêng biệt (mô phỏng hai request) KHÔNG chia sẻ cache — mỗi lần tự nạp grants', async () => {
    userRolesRepo.getScopedGrants.mockResolvedValue([grant({ code: '*' })]);
    const contextA = buildContext('scopeless', { user: { sub: 'u1' } });
    const contextB = buildContext('scopeless', { user: { sub: 'u1' } });

    await guard.canActivate(contextA);
    await guard.canActivate(contextB);

    expect(userRolesRepo.getScopedGrants).toHaveBeenCalledTimes(2);
  });
});
