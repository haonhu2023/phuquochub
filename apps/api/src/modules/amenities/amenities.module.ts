import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';
import { AmenitiesRepository } from './repositories/amenities.repository';

// Amenities (product spec, 2026-09-29) — dict dùng chung (place_amenities.place_id), tách khỏi
// HotelsModule vì KHÔNG phải khái niệm riêng của khách sạn (xem AmenitiesRepository). Cần
// PlacesModule cho PlacesService.getSlugAndStatus (audit + cache invalidation sau ghi).
@Module({
  imports: [PlacesModule],
  controllers: [AmenitiesController],
  providers: [AmenitiesRepository, AmenitiesService],
})
export class AmenitiesModule {}
