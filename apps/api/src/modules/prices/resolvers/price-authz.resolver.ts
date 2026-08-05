import { Injectable } from '@nestjs/common';
import type {
  AuthorizationContext,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../../authz/authorization-context';
import { PricesRepository } from '../repositories/prices.repository';

// ADR-019 D5/D16 (Resource-Scoped Authorization, M0.2). price id -> place id sở hữu nó
// (price_history.entity_id, khi entity_type='place'). Đăng ký trong CHÍNH module sở hữu tài
// nguyên (PricesModule, D5). Thuần (không side effect), KHÔNG cưỡng chế chính sách. Không tồn
// tại / đã xoá mềm (PricesRepository.findById lọc deletedAt IS NULL) / entity_type khác 'place'
// -> null (INV-A4, guard DENY).
export const PRICE_AUTHZ_RESOLVER = Symbol('PRICE_AUTHZ_RESOLVER');

const ENTITY_PLACE = 'place';

@Injectable()
export class PriceAuthzResolver implements AuthorizationContextResolver {
  constructor(private readonly prices: PricesRepository) {}

  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    const price = await this.prices.findById(input.resourceId);
    if (!price || price.entityType !== ENTITY_PLACE) {
      return null;
    }
    return {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      businessId: price.entityId,
      ownerId: null,
    };
  }
}
