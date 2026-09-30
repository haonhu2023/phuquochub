import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { BeachesController } from './beaches.controller';
import { BeachesService } from './beaches.service';
import { BeachesRepository } from './repositories/beaches.repository';

// Beach = Place (category='beach'). Từ InitBeachDetails1720007700000 (product spec, 2026-09-29)
// có bảng vệ tinh riêng (place_beach_details) ⇒ cần PlacesModule (PlacesService) cho base detail,
// cùng khuôn HotelsModule/RestaurantsModule.
@Module({
  imports: [PlacesModule],
  controllers: [BeachesController],
  providers: [BeachesRepository, BeachesService],
})
export class BeachesModule {}
