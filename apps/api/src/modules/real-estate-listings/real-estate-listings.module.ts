import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateListingTranslation } from './entities/real-estate-listing-translation.entity';
import { RealEstateListingsRepository } from './repositories/real-estate-listings.repository';
import { RealEstateListingTranslationsRepository } from './repositories/real-estate-listing-translations.repository';
import { RealEstateListingsService } from './real-estate-listings.service';
import { RealEstateListingTranslationsService } from './real-estate-listing-translations.service';
import { RealEstateListingsController } from './real-estate-listings.controller';
import { RealEstateListingTranslationsController } from './real-estate-listing-translations.controller';
import { RbacModule } from '../rbac/rbac.module';

// `RbacModule` cho `AuthorizationService` — close()/reopen()/mark-*() cần kiểm
// `RealEstateListing.Moderate` TẠI SERVICE (chủ tin hoặc moderator đều được), cùng lý do
// JobListingsModule imports RbacModule. RealEstateListingTranslations* (Gói C phần 2/2, 17/10/2026)
// nằm CHUNG module này — khớp 1:1 với real_estate_listings, cùng mẫu JobListingsModule.
@Module({
  imports: [TypeOrmModule.forFeature([RealEstateListing, RealEstateListingTranslation]), RbacModule],
  controllers: [RealEstateListingsController, RealEstateListingTranslationsController],
  providers: [
    RealEstateListingsRepository,
    RealEstateListingTranslationsRepository,
    RealEstateListingsService,
    RealEstateListingTranslationsService,
  ],
  exports: [RealEstateListingsRepository, RealEstateListingsService],
})
export class RealEstateListingsModule {}
