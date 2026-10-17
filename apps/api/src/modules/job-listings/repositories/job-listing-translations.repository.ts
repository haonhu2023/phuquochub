import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobListingTranslation } from '../entities/job-listing-translation.entity';
import { JobListingTranslationStatus } from '../job-listings.enums';

const LOCALE_EN = 'en';

@Injectable()
export class JobListingTranslationsRepository {
  constructor(@InjectRepository(JobListingTranslation) private readonly repo: Repository<JobListingTranslation>) {}

  findByJobListingId(jobListingId: string): Promise<JobListingTranslation | null> {
    return this.repo.findOne({ where: { jobListingId, locale: LOCALE_EN } });
  }

  save(entity: JobListingTranslation): Promise<JobListingTranslation> {
    return this.repo.save(entity);
  }

  create(jobListingId: string): JobListingTranslation {
    const entity = new JobListingTranslation();
    entity.jobListingId = jobListingId;
    entity.locale = LOCALE_EN;
    entity.status = JobListingTranslationStatus.DRAFT;
    return entity;
  }

  // Hàng chờ duyệt bản dịch — cùng mẫu JobListingsRepository.listPending() (chỉ pending).
  listPending(): Promise<JobListingTranslation[]> {
    return this.repo.find({ where: { status: JobListingTranslationStatus.PENDING }, order: { createdAt: 'ASC' } });
  }
}
