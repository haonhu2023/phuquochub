import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsRepository } from './repositories/restaurants.repository';

// Restaurant (Wave 2, ADR-002) — tái dùng PlacesModule cho base Place.
@Module({
  imports: [PlacesModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsRepository, RestaurantsService],
})
export class RestaurantsModule {}
