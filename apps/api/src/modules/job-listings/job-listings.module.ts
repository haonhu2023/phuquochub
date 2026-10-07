import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobListing } from './entities/job-listing.entity';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListingsService } from './job-listings.service';
import { JobListingsController } from './job-listings.controller';
import { RbacModule } from '../rbac/rbac.module';

// `RbacModule` cho `AuthorizationService` — close()/reopen() cần kiểm `JobListing.Moderate` TẠI
// SERVICE (owner hoặc moderator đều được, không biết trước lúc khai @RequirePermissions tĩnh trên
// controller) — cùng lý do ModerationModule imports RbacModule cho ModerationService.decide().
@Module({
  imports: [TypeOrmModule.forFeature([JobListing]), RbacModule],
  controllers: [JobListingsController],
  providers: [JobListingsRepository, JobListingsService],
  exports: [JobListingsRepository, JobListingsService],
})
export class JobListingsModule {}
