import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';
import { BookingsRepository } from './repositories/bookings.repository';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingItem]), PlacesModule],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService],
  exports: [BookingsRepository, BookingsService],
})
export class BookingsModule {}
