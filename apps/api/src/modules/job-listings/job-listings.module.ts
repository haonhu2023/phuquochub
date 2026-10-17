import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListingTranslationsRepository } from './repositories/job-listing-translations.repository';
import { JobListingsService } from './job-listings.service';
import { JobListingTranslationsService } from './job-listing-translations.service';
import { JobListingsController } from './job-listings.controller';
import { JobListingTranslationsController } from './job-listing-translations.controller';
import { RbacModule } from '../rbac/rbac.module';

// `RbacModule` cho `AuthorizationService` — close()/reopen() cần kiểm `JobListing.Moderate` TẠI
// SERVICE (owner hoặc moderator đều được, không biết trước lúc khai @RequirePermissions tĩnh trên
// controller) — cùng lý do ModerationModule imports RbacModule cho ModerationService.decide().
// JobListingTranslations* (Gói C phần 1/2, 17/10/2026) nằm CHUNG module này (không module riêng
// như place-translations) — khớp 1:1 với job_listings, không có lý do tách.
@Module({
  imports: [TypeOrmModule.forFeature([JobListing, JobListingTranslation]), RbacModule],
  controllers: [JobListingsController, JobListingTranslationsController],
  providers: [JobListingsRepository, JobListingTranslationsRepository, JobListingsService, JobListingTranslationsService],
  exports: [JobListingsRepository, JobListingsService],
})
export class JobListingsModule {}
