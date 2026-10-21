import { Injectable } from '@nestjs/common';
import type {
  AuthorizationContext,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../../authz/authorization-context';
import { BookingsRepository } from '../repositories/bookings.repository';

// Giai đoạn 3 (ADR-019 D5/D16) — booking id (`:id` nội bộ trên POST /bookings/:id/{confirm,cancel})
// -> place id sở hữu nó (`bookings.place_id`). Cùng khuôn ContactAuthzResolver — đăng ký trong
// CHÍNH module sở hữu tài nguyên (BookingsModule, D5). Thuần (không side effect), KHÔNG cưỡng chế
// chính sách — chỉ phân giải danh tính. Không tồn tại -> null (INV-A4, guard DENY).
export const BOOKING_AUTHZ_RESOLVER = Symbol('BOOKING_AUTHZ_RESOLVER');

@Injectable()
export class BookingAuthzResolver implements AuthorizationContextResolver {
  constructor(private readonly bookingsRepo: BookingsRepository) {}

  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    const booking = await this.bookingsRepo.findById(input.resourceId);
    if (!booking) {
      return null;
    }
    return {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      businessId: booking.placeId,
      ownerId: null,
    };
  }
}
