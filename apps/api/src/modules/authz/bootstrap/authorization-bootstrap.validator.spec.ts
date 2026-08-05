import 'reflect-metadata';
import { AuthorizationBootstrapValidator } from './authorization-bootstrap.validator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { AuthorizationContext } from '../decorators/authorization-context.decorator';
import { IDENTITY_PLACE_RESOLVER } from '../resolvers/identity-place.resolver';
import { PRINCIPAL_RESOLVER } from '../resolvers/principal.resolver';
import { Reflector } from '@nestjs/core';

const UNREGISTERED_TOKEN = Symbol('UNREGISTERED_TOKEN');

class GoodManagedController {
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  update(): void {
    /* noop */
  }
}

class MissingContextController {
  @RequirePermissions('Place.Edit.Managed')
  update(): void {
    /* noop — cố ý thiếu @AuthorizationContext */
  }
}

class UnregisteredResolverController {
  @RequirePermissions('Contact.Edit.Managed')
  @AuthorizationContext({
    resourceType: 'contact',
    resource: { from: 'param', name: 'id' },
    resolver: UNREGISTERED_TOKEN,
  })
  update(): void {
    /* noop */
  }
}

class ScopelessController {
  @RequirePermissions('Category.Manage')
  create(): void {
    /* noop — không hậu tố scope, không cần context */
  }
}

class AnyScopeController {
  @RequirePermissions('Place.Edit.Any')
  moderate(): void {
    /* noop */
  }
}

class MissingContextOwnController {
  // M0.3: D9 nay cưỡng chế CẢ `.Own` — route thiếu @AuthorizationContext PHẢI fail bootstrap,
  // đúng như route Managed thiếu context. Đây là bằng chứng ngoại lệ M0.2 đã bị gỡ bỏ hoàn toàn.
  @RequirePermissions('Media.Upload.Own')
  upload(): void {
    /* noop — cố ý thiếu @AuthorizationContext */
  }
}

class GoodOwnController {
  // M0.3: route Own với @AuthorizationContext hợp lệ (principal + PRINCIPAL_RESOLVER) -> boot OK.
  @RequirePermissions('User.Edit.Own')
  @AuthorizationContext({
    resourceType: 'user',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  updateMe(): void {
    /* noop */
  }
}

class NoPermissionController {
  publicRead(): void {
    /* noop — @Public, không có @RequirePermissions */
  }
}

type Ctor = new () => object;

function makeWrapper(metatype: Ctor) {
  const instance = new metatype();
  return { instance, metatype };
}

function makeValidator(controllers: Ctor[], resolverRegistry: Set<symbol>) {
  const discovery = { getControllers: jest.fn().mockReturnValue(controllers.map(makeWrapper)) };
  const metadataScanner = {
    getAllMethodNames: jest.fn((prototype: object) =>
      Object.getOwnPropertyNames(prototype).filter((n) => n !== 'constructor'),
    ),
  };
  const reflector = new Reflector();
  const moduleRef = {
    get: jest.fn((token: symbol) => {
      if (resolverRegistry.has(token)) {
        return { resolve: jest.fn() };
      }
      throw new Error('UnknownElementException');
    }),
  };

  const validator = new AuthorizationBootstrapValidator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    discovery as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadataScanner as any,
    reflector,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moduleRef as any,
  );
  return validator;
}

describe('AuthorizationBootstrapValidator (ADR-019 D9, M0.3: Managed + Own)', () => {
  it('handler Managed CÓ @AuthorizationContext hợp lệ + resolver identity đăng ký -> KHÔNG throw', () => {
    const validator = makeValidator([GoodManagedController], new Set([IDENTITY_PLACE_RESOLVER]));
    expect(() => validator.onApplicationBootstrap()).not.toThrow();
  });

  it('handler Managed THIẾU @AuthorizationContext -> throw, nêu đích danh controller/handler/permission', () => {
    const validator = makeValidator([MissingContextController], new Set([IDENTITY_PLACE_RESOLVER]));
    expect(() => validator.onApplicationBootstrap()).toThrow(/MissingContextController/);
    expect(() => validator.onApplicationBootstrap()).toThrow(/update/);
    expect(() => validator.onApplicationBootstrap()).toThrow(/Place\.Edit\.Managed/);
  });

  it('resolver token khai báo KHÔNG đăng ký qua ModuleRef -> throw', () => {
    const validator = makeValidator([UnregisteredResolverController], new Set([IDENTITY_PLACE_RESOLVER]));
    expect(() => validator.onApplicationBootstrap()).toThrow(/UnregisteredResolverController/);
  });

  it('route scope-less (không hậu tố) -> KHÔNG cần @AuthorizationContext, không throw', () => {
    const validator = makeValidator([ScopelessController], new Set());
    expect(() => validator.onApplicationBootstrap()).not.toThrow();
  });

  it('route scope Any -> KHÔNG cần @AuthorizationContext, không throw', () => {
    const validator = makeValidator([AnyScopeController], new Set());
    expect(() => validator.onApplicationBootstrap()).not.toThrow();
  });

  it('route KHÔNG khai báo permission nào -> bỏ qua hoàn toàn, không throw', () => {
    const validator = makeValidator([NoPermissionController], new Set());
    expect(() => validator.onApplicationBootstrap()).not.toThrow();
  });

  it('handler Own CÓ @AuthorizationContext hợp lệ (principal + PRINCIPAL_RESOLVER đăng ký) -> KHÔNG throw', () => {
    const validator = makeValidator([GoodOwnController], new Set([PRINCIPAL_RESOLVER]));
    expect(() => validator.onApplicationBootstrap()).not.toThrow();
  });

  it('handler Own THIẾU @AuthorizationContext -> throw (M0.3: ngoại lệ M0.2 đã gỡ bỏ, D9 áp nguyên văn)', () => {
    const validator = makeValidator([MissingContextOwnController], new Set([PRINCIPAL_RESOLVER]));
    expect(() => validator.onApplicationBootstrap()).toThrow(/MissingContextOwnController/);
    expect(() => validator.onApplicationBootstrap()).toThrow(/upload/);
    expect(() => validator.onApplicationBootstrap()).toThrow(/Media\.Upload\.Own/);
  });

  it('nhiều controller vi phạm (Managed lẫn Own) -> tất cả được liệt kê trong MỘT thông điệp lỗi', () => {
    const validator = makeValidator(
      [GoodManagedController, MissingContextController, UnregisteredResolverController, MissingContextOwnController],
      new Set([IDENTITY_PLACE_RESOLVER, PRINCIPAL_RESOLVER]),
    );
    let thrown: Error | undefined;
    try {
      validator.onApplicationBootstrap();
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/MissingContextController/);
    expect(thrown!.message).toMatch(/UnregisteredResolverController/);
    expect(thrown!.message).toMatch(/MissingContextOwnController/);
    expect(thrown!.message).not.toMatch(/GoodManagedController/);
  });
});
