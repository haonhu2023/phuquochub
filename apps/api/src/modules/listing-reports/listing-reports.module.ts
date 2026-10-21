import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingReport } from './entities/listing-report.entity';
import { ListingReportsRepository } from './repositories/listing-reports.repository';
import { ListingReportsService } from './listing-reports.service';
import { ListingReportsController } from './listing-reports.controller';
import { JobListingsModule } from '../job-listings/job-listings.module';
import { RealEstateListingsModule } from '../real-estate-listings/real-estate-listings.module';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';

// Cùng mẫu SavedItemsModule: import JobListingsModule/RealEstateListingsModule/PlacesModule cho
// service của chúng (đọc công khai + "mine" qua ĐÚNG đường đang dùng), RbacModule cho
// AuthorizationService (lọc hàng chờ/resolve() theo quyền duyệt từng loại). Một chiều, không cycle.
@Module({
  imports: [
    TypeOrmModule.forFeature([ListingReport]),
    JobListingsModule,
    RealEstateListingsModule,
    PlacesModule,
    RbacModule,
  ],
  controllers: [ListingReportsController],
  providers: [ListingReportsRepository, ListingReportsService],
})
export class ListingReportsModule {}
