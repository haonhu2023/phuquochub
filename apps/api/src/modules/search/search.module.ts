import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [PlacesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
