import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedItem } from './entities/saved-item.entity';
import { SavedItemsRepository } from './repositories/saved-items.repository';
import { SavedItemsService } from './saved-items.service';
import { SavedItemsController } from './saved-items.controller';
import { JobListingsModule } from '../job-listings/job-listings.module';
import { RealEstateListingsModule } from '../real-estate-listings/real-estate-listings.module';
import { PlacesModule } from '../places/places.module';

// Import JobListingsModule/RealEstateListingsModule/PlacesModule CHO service của chúng (đọc tin
// công khai qua ĐÚNG đường route công khai đang dùng, xem saved-items.service.ts's comment) — một
// chiều, các module đó không import ngược lại module này, không có cycle.
@Module({
  imports: [TypeOrmModule.forFeature([SavedItem]), JobListingsModule, RealEstateListingsModule, PlacesModule],
  controllers: [SavedItemsController],
  providers: [SavedItemsRepository, SavedItemsService],
})
export class SavedItemsModule {}
