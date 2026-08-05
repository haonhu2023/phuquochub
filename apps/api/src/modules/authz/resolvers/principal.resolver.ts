import { Injectable } from '@nestjs/common';
import type {
  AuthorizationContext,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../authorization-context';

// ADR-019 D5/D15/D16 (Resource-Scoped Authorization, M0.3 — Own-Scope Hardening). Route scope
// `Own` mà chủ thể tài nguyên LÀ chính người gọi (vd `PATCH /users/me`, `POST /media`,
// `POST /media/presign`) — KHÔNG thực hiện truy vấn DB nào: danh tính người gọi đã được
// `JwtAuthGuard` xác thực (`request.user.sub`), đó CHÍNH LÀ câu trả lời. Dùng khi
// `@AuthorizationContext` khai báo `resource: { from: 'principal' }` (D4) — PHẢI khai báo
// `resolver: PRINCIPAL_RESOLVER` tường minh, KHÔNG dùng ngầm định (ngầm định chỉ áp cho
// `IDENTITY_PLACE_RESOLVER`, trường hợp id CHÍNH LÀ businessId — không phải trường hợp này).
export const PRINCIPAL_RESOLVER = Symbol('PRINCIPAL_RESOLVER');

@Injectable()
export class PrincipalResolver implements AuthorizationContextResolver {
  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    return {
      resourceType: input.resourceType,
      resourceId: input.userId,
      businessId: null,
      ownerId: input.userId,
    };
  }
}
