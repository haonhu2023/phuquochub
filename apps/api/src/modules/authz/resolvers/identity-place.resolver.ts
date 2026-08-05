import { Injectable } from '@nestjs/common';
import type {
  AuthorizationContext,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../authorization-context';

// ADR-019 D5/D16 (Resource-Scoped Authorization, M0.2). Route mà `:id` tài nguyên CHÍNH LÀ
// place/business id (ADR-015 Model A: business_id === places.id) — 5 trong 8 handler Managed đi
// qua resolver này (PlacesController.update, HotelsController.updateRooms,
// RestaurantsController.updateMenu, ContactsController.create, PricesController.create). KHÔNG
// thực hiện truy vấn DB nào — identity là câu trả lời. Dùng ngầm định khi `@AuthorizationContext`
// không khai báo `resolver` (D4).
export const IDENTITY_PLACE_RESOLVER = Symbol('IDENTITY_PLACE_RESOLVER');

@Injectable()
export class IdentityPlaceResolver implements AuthorizationContextResolver {
  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    return {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      businessId: input.resourceId,
      ownerId: null,
    };
  }
}
