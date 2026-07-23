import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';

@Module({
  imports: [PlacesModule],
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
