import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobListingTranslation } from '../entities/job-listing-translation.entity';
import { JobListingTranslationStatus } from '../job-listings.enums';

const LOCALE_EN = 'en';

@Injectable()
export class JobListingTranslationsRepository {
  constructor(@InjectRepository(JobListingTranslation) private readonly repo: Repository<JobListingTranslation>) {}

  findByJobListingId(jobListingId: string): Promise<JobListingTranslation | null> {
    return this.repo.findOne({ where: { jobListingId, locale: LOCALE_EN } });
  }

  // CHỈ dùng cho INSERT lần đầu (chưa có row nào) — KHÔNG có CAS nào áp dụng được (không có hàng
  // cũ để so content_version). Sửa một bản dịch đã tồn tại PHẢI qua updateWithCas() dưới đây.
  insertNew(entity: JobListingTranslation): Promise<JobListingTranslation> {
    return this.repo.save(entity);
  }

  create(jobListingId: string): JobListingTranslation {
    const entity = new JobListingTranslation();
    entity.jobListingId = jobListingId;
    entity.locale = LOCALE_EN;
    entity.status = JobListingTranslationStatus.DRAFT;
    return entity;
  }

  // CAS — cùng khuôn PlacesRepository.updateScalarsWithCas(): UPDATE có điều kiện
  // `WHERE id=? AND content_version=?`, 0 row ảnh hưởng (đã bị người khác sửa/duyệt trước) → false,
  // service KHÔNG ghi đè âm thầm, trả 409. KHÔNG dùng TypeORM `@VersionColumn()` — giữ nhất quán
  // với cơ chế CAS hand-rolled đã có trong repo này.
  async updateWithCas(id: string, patch: Partial<JobListingTranslation>, expectedVersion: number): Promise<boolean> {
    const result = await this.repo.update({ id, contentVersion: expectedVersion }, { ...patch, contentVersion: expectedVersion + 1 });
    return (result.affected ?? 0) > 0;
  }

  // Hàng chờ duyệt bản dịch — cùng mẫu JobListingsRepository.listPending() (chỉ pending).
  listPending(): Promise<JobListingTranslation[]> {
    return this.repo.find({ where: { status: JobListingTranslationStatus.PENDING }, order: { createdAt: 'ASC' } });
  }

  // Gói C §3 (17/10/2026) — overlay bản dịch cho danh sách công khai KHÔNG ĐƯỢC N+1 (một truy vấn
  // cho CẢ TRANG, không một truy vấn mỗi thẻ tin). Trả MỌI row khớp id (kể cả draft/pending/
  // rejected — caller tự kiểm `publishedTitle != null` trước khi dùng, cùng quy tắc getPublicById()).
  async findByJobListingIds(jobListingIds: string[]): Promise<Map<string, JobListingTranslation>> {
    if (jobListingIds.length === 0) return new Map();
    const rows = await this.repo.find({ where: { jobListingId: In(jobListingIds), locale: LOCALE_EN } });
    return new Map(rows.map((r) => [r.jobListingId, r]));
  }
}
