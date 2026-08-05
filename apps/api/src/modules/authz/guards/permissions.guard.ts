import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import {
  AuthorizationContextOptions,
  AuthzResourceSource,
} from '../decorators/authorization-context.decorator';
import { AuthorizationService } from '../authorization.service';
import { UserRolesRepository } from '../../rbac/repositories/user-roles.repository';
import { RequestScopedGrantCache } from '../request-scoped-grant-cache';
import {
  AUTHZ_CONTEXT_KEY,
  AuthorizationContext,
  AuthorizationContextResolver,
} from '../authorization-context';
import { IDENTITY_PLACE_RESOLVER } from '../resolvers/identity-place.resolver';

// PEP tầng AuthZ: đọc permission yêu cầu (metadata) → hỏi PDP. Deny-by-default.
//
// ADR-019 M0.2 (Resource-Scoped Authorization — PEP + Resolvers + Rollout). Guard vẫn giữ ĐÚNG
// trách nhiệm cũ (đọc metadata, hỏi PDP, dịch boolean thành 403, D1) — KHÔNG tự ra quyết định
// chính sách nào. Hai bổ sung:
//
//   1. D11 — ghi nhớ theo request: `RequestScopedGrantCache` được tạo MỚI mỗi lần `canActivate`
//      chạy — Nest gọi `canActivate` ĐÚNG MỘT LẦN cho mỗi request (không phải mỗi permission), nên
//      một biến cục bộ trong hàm này TỰ ĐỘNG là request-scoped, không cần Nest `Scope.REQUEST`
//      provider, không cần gắn gì vào `request`. `grants` được nạp đúng một lần rồi tái dùng cho
//      MỌI permission trong `@RequirePermissions('A','B',...)`.
//   2. D2/D5/D6 — context provider LƯỜI: chỉ dựng thunk, KHÔNG gọi `ModuleRef.get`/`resolver.resolve`
//      cho tới khi `AuthorizationService` (PDP) thực sự cần (đường chậm — không có grant
//      context-free nào thỏa). Any/wildcard/scope-less KHÔNG BAO GIỜ chạm resolver (giữ nguyên
//      hiệu năng D2 bước 3). Kết quả phân giải được ghi nhớ theo khoá resolver/resourceType/
//      resourceId trong CÙNG request (D11).
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // endpoint không khai báo permission → chỉ cần đã xác thực
    }

    const request = context.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (request as any).user as { sub: string } | undefined;
    if (!user?.sub) {
      throw new UnauthorizedException('Cần đăng nhập');
    }

    // D11: một instance MỚI mỗi lần canActivate chạy (= mỗi request) — hợp đồng của
    // RequestScopedGrantCache. `grants` nạp đúng MỘT lần, tái dùng cho mọi permission dưới đây.
    const grantCache = new RequestScopedGrantCache((uid) => this.userRolesRepo.getScopedGrants(uid));
    const grants = await grantCache.load(user.sub);

    // Ghi nhớ theo khoá resolver/resourceType/resourceId trong PHẠM VI request này (D11) — cùng
    // một handler chỉ có MỘT bộ metadata @AuthorizationContext nên trong thực tế chỉ tính MỘT
    // lần, nhưng Map giữ đúng hợp đồng tổng quát của D11.
    const contextCache = new Map<string, Promise<AuthorizationContext | null>>();
    const contextProvider = this.buildContextProvider(context, request, user.sub, contextCache);

    for (const permission of required) {
      // ADR-019 D9 (phạm vi M0.2, quyết định Owner — xem AuthorizationBootstrapValidator): CHỈ
      // permission hậu tố `.Managed` đi qua đường đánh giá hai pha (context-aware, fail-closed).
      // `.Own`/`.Any`/scope-less giữ NGUYÊN đường tương thích rank-thuần (KHÔNG contextProvider) —
      // Own-scope rollout là M0.3 (ADR-019 D15); route `.Own` đang sống hôm nay (`Media.Upload.Own`,
      // `User.Edit.Own`) an toàn CHỈ nhờ quy ước cấu trúc, KHÔNG có `@AuthorizationContext` nào, và
      // sẽ 403 SAI nếu bị ép qua đường context-aware ở M0.2 (regression y hệt cái M0.1 đã bắt và
      // sửa cho `can()` — xem authorization.service.ts — giờ áp lại đúng nguyên tắc đó ở guard).
      const needsContext = permission.endsWith('.Managed');
      const ok = await this.authz.canWithGrants(
        grants,
        user.sub,
        permission,
        needsContext ? contextProvider : undefined,
      );
      if (!ok) {
        throw new ForbiddenException(`Thiếu quyền: ${permission}`);
      }
    }
    return true;
  }

  /**
   * Dựng thunk LƯỜI (D2) — thân hàm chỉ chạy khi `AuthorizationService.canWithGrants()` thực sự
   * gọi tới (đường chậm). Mọi nhánh thất bại trả `null` (KHÔNG ném lỗi ra ngoài provider) — D2 bước
   * 5 coi `null` là DENY, giữ đúng thông điệp 403 đồng nhất (D10) bất kể lý do thất bại là gì.
   */
  private buildContextProvider(
    context: ExecutionContext,
    request: Request,
    userId: string,
    contextCache: Map<string, Promise<AuthorizationContext | null>>,
  ): () => Promise<AuthorizationContext | null> {
    return () => {
      const meta = this.reflector.getAllAndOverride<AuthorizationContextOptions>(AUTHZ_CONTEXT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!meta) {
        // INV-A1: permission cần ngữ cảnh (Managed/Own) nhưng route thiếu @AuthorizationContext.
        return Promise.resolve(null);
      }

      const resourceId = this.extractResourceId(meta.resource, request, userId);
      if (resourceId === null) {
        this.logger.error(
          `AuthorizationContext: thiếu route param cho resourceType=${meta.resourceType} (${this.describeSource(meta.resource)})`,
        );
        return Promise.resolve(null);
      }

      const resolverToken = meta.resolver ?? IDENTITY_PLACE_RESOLVER;
      const cacheKey = `${resolverToken.toString()}::${meta.resourceType}::${resourceId}`;
      const cached = contextCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const resolved = this.resolveViaToken(resolverToken, meta.resourceType, resourceId, userId);
      contextCache.set(cacheKey, resolved);
      return resolved;
    };
  }

  private async resolveViaToken(
    token: symbol,
    resourceType: string,
    resourceId: string,
    userId: string,
  ): Promise<AuthorizationContext | null> {
    let resolver: AuthorizationContextResolver;
    try {
      resolver = this.moduleRef.get<AuthorizationContextResolver>(token, { strict: false });
    } catch (err) {
      // INV-A2: token resolver không đăng ký / không tìm thấy qua ModuleRef.
      this.logger.error(
        `AuthorizationContextResolver không tìm thấy cho token ${token.toString()} (resourceType=${resourceType})`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
    if (!resolver) {
      this.logger.error(
        `AuthorizationContextResolver rỗng cho token ${token.toString()} (resourceType=${resourceType})`,
      );
      return null;
    }

    try {
      // INV-A4: resolver trả null (không tồn tại/xoá mềm/không gắn business) → truyền thẳng qua.
      return await resolver.resolve({ resourceId, resourceType, userId });
    } catch (err) {
      // INV-A5: resolver ném lỗi — KHÔNG BAO GIỜ hiểu là pass.
      this.logger.error(
        `AuthorizationContextResolver (token=${token.toString()}) ném lỗi khi phân giải resourceType=${resourceType} resourceId=${resourceId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  private extractResourceId(
    source: AuthzResourceSource,
    request: Request,
    userId: string,
  ): string | null {
    if (source.from === 'principal') {
      return userId;
    }
    const params = request.params as Record<string, string> | undefined;
    const value = params?.[source.name];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private describeSource(source: AuthzResourceSource): string {
    return source.from === 'principal' ? 'principal' : `param:${source.name}`;
  }
}
