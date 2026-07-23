import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { ToursController } from './tours.controller';
import { ToursService } from './tours.service';
import { ToursRepository } from './repositories/tours.repository';

// Tour (Wave 2, ADR-002) — tái dùng PlacesModule (PlacesService.create cho base Place).
@Module({
  imports: [PlacesModule],
  controllers: [ToursController],
  providers: [ToursRepository, ToursService],
})
export class ToursModule {}
