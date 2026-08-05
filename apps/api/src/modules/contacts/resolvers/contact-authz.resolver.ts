import { Injectable } from '@nestjs/common';
import type {
  AuthorizationContext,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../../authz/authorization-context';
import { ContactsRepository } from '../repositories/contacts.repository';

// ADR-019 D5/D16 (Resource-Scoped Authorization, M0.2). contact id -> place id sở hữu nó
// (contacts.owner_id, khi owner_type='place'). Đăng ký trong CHÍNH module sở hữu tài nguyên
// (ContactsModule, D5). Thuần (không side effect), KHÔNG cưỡng chế chính sách — chỉ phân giải
// danh tính. Không tồn tại / đã xoá mềm (ContactsRepository.findById lọc deletedAt IS NULL) /
// owner_type khác 'place' -> null (INV-A4, guard DENY).
export const CONTACT_AUTHZ_RESOLVER = Symbol('CONTACT_AUTHZ_RESOLVER');

const OWNER_PLACE = 'place';

@Injectable()
export class ContactAuthzResolver implements AuthorizationContextResolver {
  constructor(private readonly contacts: ContactsRepository) {}

  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    const contact = await this.contacts.findById(input.resourceId);
    if (!contact || contact.ownerType !== OWNER_PLACE) {
      return null;
    }
    return {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      businessId: contact.ownerId,
      ownerId: null,
    };
  }
}
