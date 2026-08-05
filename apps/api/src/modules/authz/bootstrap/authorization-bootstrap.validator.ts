import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, ModuleRef, Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AUTHZ_CONTEXT_KEY } from '../authorization-context';
import type { AuthorizationContextOptions } from '../decorators/authorization-context.decorator';
import { IDENTITY_PLACE_RESOLVER } from '../resolvers/identity-place.resolver';

// ADR-019 D9 (Resource-Scoped Authorization, M0.2 — PEP + Resolvers + Rollout), Owner D2.
//
// PHẠM VI M0.2 (quyết định Owner rõ ràng, KHÔNG suy luận ngầm): D9 tự thân nói "Managed HOẶC Own"
// không có ngoại lệ theo milestone. Nhưng M0.2 CHỦ ĐỘNG không triển khai Own-scope (đó là M0.3,
// ADR-019 D15) — các route `.Own` đang sống hôm nay (`Media.Upload.Own`, `User.Edit.Own`) an toàn
// CHỈ nhờ quy ước cấu trúc (không tham số `:id`), KHÔNG có `@AuthorizationContext` nào, và
// KHÔNG được phép gắn trong M0.2. Áp D9 nguyên văn (Managed lẫn Own) sẽ làm ứng dụng KHÔNG khởi
// động được ngay khi M0.2 ship — mâu thuẫn trực tiếp với yêu cầu "route Own hiện có không được vỡ
// ở M0.2". Owner đã xác nhận: validator này CHỈ cưỡng chế D9 cho permission hậu tố `.Managed`
// trong M0.2; hậu tố `.Own` được loại trừ tường minh khỏi phạm vi quét, để lại cho M0.3. Xem báo
// cáo hoàn tất M0.2 (docs/delivery/reports/) để biết đầy đủ lý do.
//
// Chạy ở `onApplicationBootstrap` — SAU khi mọi module đã khởi tạo, TRƯỚC khi `app.listen()` nhận
// request đầu tiên (main.ts gọi theo đúng thứ tự NestFactory.create → ... → app.listen). Cưỡng chế
// lúc request (INV-A1, trong PermissionsGuard) vẫn giữ nguyên làm phòng thủ chiều sâu — hai lớp,
// không phải một thay cho lớp kia.
const MANAGED_SUFFIX = '.Managed';

interface Violation {
  controller: string;
  handler: string;
  route: string | null;
  permission: string;
  reason: string;
}

@Injectable()
export class AuthorizationBootstrapValidator implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthorizationBootstrapValidator.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap(): void {
    const violations = this.collectViolations();
    if (violations.length === 0) {
      return;
    }

    const lines = violations.map(
      (v) =>
        `${v.controller}.${v.handler}${v.route ? ` [${v.route}]` : ''} — permission "${v.permission}": ${v.reason}`,
    );
    const message = [
      `ADR-019 D9: bootstrap validation thất bại — ${violations.length} handler Managed thiếu ngữ cảnh phân quyền hợp lệ:`,
      ...lines.map((l) => `  - ${l}`),
    ].join('\n');

    this.logger.error(message);
    throw new Error(message);
  }

  private collectViolations(): Violation[] {
    const violations: Violation[] = [];
    const controllers = this.discovery.getControllers();

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) {
        continue;
      }
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) {
        continue;
      }
      const controllerName = metatype.name;

      this.metadataScanner.getAllMethodNames(prototype).forEach((methodName) => {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') {
          return;
        }

        const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
          PERMISSIONS_KEY,
          [handler, metatype],
        );
        const managedPermissions = (requiredPermissions ?? []).filter((p) => p.endsWith(MANAGED_SUFFIX));
        if (managedPermissions.length === 0) {
          return; // scope-less/Any/Own — D9 M0.2 chỉ quét Managed (xem ghi chú đầu file)
        }

        const route = this.extractRoute(metatype, handler);
        const meta = this.reflector.getAllAndOverride<AuthorizationContextOptions | undefined>(
          AUTHZ_CONTEXT_KEY,
          [handler, metatype],
        );

        if (!meta) {
          for (const permission of managedPermissions) {
            violations.push({
              controller: controllerName,
              handler: methodName,
              route,
              permission,
              reason: 'thiếu @AuthorizationContext metadata (handler lẫn class)',
            });
          }
          return;
        }

        const resolverToken = meta.resolver ?? IDENTITY_PLACE_RESOLVER;
        if (!this.isResolverRegistered(resolverToken)) {
          for (const permission of managedPermissions) {
            violations.push({
              controller: controllerName,
              handler: methodName,
              route,
              permission,
              reason: `resolver token ${resolverToken.toString()} không đăng ký được qua ModuleRef`,
            });
          }
        }
      });
    }

    return violations;
  }

  private isResolverRegistered(token: symbol): boolean {
    try {
      const resolver = this.moduleRef.get(token, { strict: false });
      return Boolean(resolver);
    } catch {
      return false;
    }
  }

  private extractRoute(metatype: object, handler: object): string | null {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
    const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
    if (controllerPath === undefined && handlerPath === undefined) {
      return null;
    }
    const base = Array.isArray(controllerPath) ? controllerPath[0] : controllerPath ?? '';
    const sub = Array.isArray(handlerPath) ? handlerPath[0] : handlerPath ?? '';
    return `/${[base, sub].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  }
}
