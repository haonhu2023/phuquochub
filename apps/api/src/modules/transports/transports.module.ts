import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { TransportsController } from './transports.controller';
import { TransportTypesController } from './transport-types.controller';
import { TransportsService } from './transports.service';
import { TransportsRepository } from './repositories/transports.repository';

// Transport (ADR-017, Accepted 2026-07-28) — tái dùng PlacesModule (PlacesService.getBySlug cho
// base Place detail), cùng mẫu HotelsModule/RestaurantsModule/ToursModule.
@Module({
  imports: [PlacesModule],
  controllers: [TransportsController, TransportTypesController],
  providers: [TransportsRepository, TransportsService],
})
export class TransportsModule {}
