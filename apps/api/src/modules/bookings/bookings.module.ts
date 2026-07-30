import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';
import { BookingsRepository } from './repositories/bookings.repository';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PlacesModule } from '../places/places.module';
import { AvailabilityModule } from '../availability/availability.module';
import { BOOKING_EVENT_PUBLISHER } from './events/booking-events';
import { LoggingBookingEventPublisher } from './events/logging-booking-event-publisher';

// AuditService không cần import ở đây — AuditModule là @Global() (app.module.ts), cùng cách
// PlacesModule tiêm AuditService mà không import AuditModule riêng. AvailabilityModule PHẢI
// import tường minh (không global) — BookingsRepository cần InventoryHoldsRepository,
// BookingsService cần AvailabilitySlotsRepository/AvailabilityService (Availability & Inventory
// Foundation, hoàn toàn optional trong luồng booking).
@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingItem]), PlacesModule, AvailabilityModule],
  controllers: [BookingsController],
  providers: [
    BookingsRepository,
    BookingsService,
    // Token-based DI (Phase 2 domain-event abstraction) — swap implementation thật (Notification/
    // Kafka/RabbitMQ) sau này chỉ cần đổi provider này, không đổi BookingsService.
    { provide: BOOKING_EVENT_PUBLISHER, useClass: LoggingBookingEventPublisher },
  ],
  exports: [BookingsRepository, BookingsService],
})
export class BookingsModule {}
