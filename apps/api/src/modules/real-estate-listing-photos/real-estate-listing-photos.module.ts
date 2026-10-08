import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealEstateListingPhoto } from './entities/real-estate-listing-photo.entity';
import { RealEstateListingPhotosRepository } from './repositories/real-estate-listing-photos.repository';
import { RealEstateListingPhotosService } from './real-estate-listing-photos.service';
import { RealEstateListingPhotosController } from './real-estate-listing-photos.controller';
import { RealEstateListingsModule } from '../real-estate-listings/real-estate-listings.module';

// StorageService/RedisService/MediaUrlService đều @Global (core/storage, core/redis,
// core/media-url) — không cần import tường minh, cùng ghi chú ở media.module.ts.
// RealEstateListingsModule cho RealEstateListingsService (kiểm sở hữu qua getMine, kiểm công khai
// qua getPublicById) — module đó đã export sẵn service này.
@Module({
  imports: [TypeOrmModule.forFeature([RealEstateListingPhoto]), RealEstateListingsModule],
  controllers: [RealEstateListingPhotosController],
  providers: [RealEstateListingPhotosRepository, RealEstateListingPhotosService],
  exports: [RealEstateListingPhotosRepository, RealEstateListingPhotosService],
})
export class RealEstateListingPhotosModule {}
