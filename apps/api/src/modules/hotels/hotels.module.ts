import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { HotelsRepository } from './repositories/hotels.repository';

// Hotel (Wave 2, ADR-002) — tái dùng PlacesModule (PlacesService/PlacesRepository) cho base Place.
@Module({
  imports: [PlacesModule],
  controllers: [HotelsController],
  providers: [HotelsRepository, HotelsService],
})
export class HotelsModule {}
