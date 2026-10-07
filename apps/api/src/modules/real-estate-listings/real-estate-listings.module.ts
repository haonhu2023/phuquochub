import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateListingsRepository } from './repositories/real-estate-listings.repository';
import { RealEstateListingsService } from './real-estate-listings.service';
import { RealEstateListingsController } from './real-estate-listings.controller';
import { RbacModule } from '../rbac/rbac.module';

// `RbacModule` cho `AuthorizationService` — close()/reopen()/mark-*() cần kiểm
// `RealEstateListing.Moderate` TẠI SERVICE (chủ tin hoặc moderator đều được), cùng lý do
// JobListingsModule imports RbacModule.
@Module({
  imports: [TypeOrmModule.forFeature([RealEstateListing]), RbacModule],
  controllers: [RealEstateListingsController],
  providers: [RealEstateListingsRepository, RealEstateListingsService],
  exports: [RealEstateListingsRepository, RealEstateListingsService],
})
export class RealEstateListingsModule {}
