import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';
import { BookingsRepository } from './repositories/bookings.repository';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PlacesModule } from '../places/places.module';
import { AvailabilityModule } from '../availability/availability.module';
import { RbacModule } from '../rbac/rbac.module';
import { BOOKING_EVENT_PUBLISHER } from './events/booking-events';
import { LoggingBookingEventPublisher } from './events/logging-booking-event-publisher';
import { BOOKING_AUTHZ_RESOLVER, BookingAuthzResolver } from './resolvers/booking-authz.resolver';

// AuditService không cần import ở đây — AuditModule là @Global() (app.module.ts), cùng cách
// PlacesModule tiêm AuditService mà không import AuditModule riêng. AvailabilityModule PHẢI
// import tường minh (không global) — BookingsRepository cần InventoryHoldsRepository,
// BookingsService cần AvailabilitySlotsRepository/AvailabilityService (Availability & Inventory
// Foundation, hoàn toàn optional trong luồng booking). RbacModule (Giai đoạn 3) — BookingsService.
// listMine() cần UserRolesRepository/AuthorizationService, cùng cách PlacesModule đã import cho
// PlacesService.listMine().
@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingItem]), PlacesModule, AvailabilityModule, RbacModule],
  controllers: [BookingsController],
  providers: [
    BookingsRepository,
    BookingsService,
    // Token-based DI (Phase 2 domain-event abstraction) — swap implementation thật (Notification/
    // Kafka/RabbitMQ) sau này chỉ cần đổi provider này, không đổi BookingsService.
    { provide: BOOKING_EVENT_PUBLISHER, useClass: LoggingBookingEventPublisher },
    // Giai đoạn 3 (ADR-019 D5) — booking id -> place id sở hữu nó, cho @AuthorizationContext trên
    // POST /bookings/:id/{confirm,cancel}.
    { provide: BOOKING_AUTHZ_RESOLVER, useClass: BookingAuthzResolver },
  ],
  exports: [BookingsRepository, BookingsService, BOOKING_AUTHZ_RESOLVER],
})
export class BookingsModule {}
