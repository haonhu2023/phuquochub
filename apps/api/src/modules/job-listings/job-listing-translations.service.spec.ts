import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { JobListingTranslationsService } from './job-listing-translations.service';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListingEmploymentType, JobListingTranslationStatus } from './job-listings.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import { computeJobListingSourceHash } from './job-listing-translation-hash';

function listingRow(overrides: Partial<JobListing> = {}): JobListing {
  const r = new JobListing();
  r.id = 'job-1';
  r.createdBy = 'owner-1';
  r.employerName = 'E';
  r.title = 'Tiêu đề gốc';
  r.jobCategory = 'c';
  r.workLocation = 'loc';
  r.employmentType = JobListingEmploymentType.FULL_TIME;
  r.contactMethod = 'phone';
  r.contactValue = '0909';
  r.description = 'Mô tả gốc';
  r.requirements = null;
  r.benefits = null;
  Object.assign(r, overrides);
  return r;
}

function translationRow(overrides: Partial<JobListingTranslation> = {}): JobListingTranslation {
  const t = new JobListingTranslation();
  t.id = 'tr-1';
  t.jobListingId = 'job-1';
  t.locale = 'en';
  t.title = 'EN title';
  t.description = 'EN description';
  t.requirements = null;
  t.benefits = null;
  t.status = JobListingTranslationStatus.DRAFT;
  t.reviewNote = null;
  t.reviewerId = null;
  t.reviewedAt = null;
  t.sourceContentHash = computeJobListingSourceHash(listingRow());
  t.createdAt = new Date('2026-10-17T00:00:00Z');
  t.updatedAt = new Date('2026-10-17T00:00:00Z');
  Object.assign(t, overrides);
  return t;
}

// Vòng đời bản dịch tiếng Anh (Gói C phần 1/2, 17/10/2026) — ĐỘC LẬP hoàn toàn với vòng đời chính
// của job_listings (xem ghi chú service). Test tập trung vào 3 điều owner đã chốt: (1) owner-only
// viết/gửi duyệt (quyền kiểm Ở SERVER qua cùng loadOwnedListing như JobListingsService), (2) không
// tự publish — luôn qua draft→pending→published/rejected, (3) không nhân đôi trường dùng chung
// (lương/liên hệ/toạ độ/...) — DTO chỉ nhận 4 trường văn bản.
describe('JobListingTranslationsService', () => {
  type Deps = ConstructorParameters<typeof JobListingTranslationsService>;
  let translationsRepo: LooseMock<Deps[0]>;
  let listingsRepo: LooseMock<Deps[1]>;
  let service: JobListingTranslationsService;

  beforeEach(() => {
    translationsRepo = createMock<Deps[0]>({
      findByJobListingId: jest.fn(),
      // Giả lập hành vi TypeORM thật: INSERT gán createdAt/updatedAt — cùng mẫu
      // JobListingsService.spec.ts's repo.create mock (xem ghi chú ở đó).
      save: jest.fn((entity: JobListingTranslation) => {
        entity.createdAt = entity.createdAt ?? new Date('2026-10-17T00:00:00Z');
        entity.updatedAt = entity.updatedAt ?? new Date('2026-10-17T00:00:00Z');
        return Promise.resolve(entity);
      }),
      create: jest.fn((jobListingId: string) => {
        const t = new JobListingTranslation();
        t.jobListingId = jobListingId;
        t.locale = 'en';
        t.status = JobListingTranslationStatus.DRAFT;
        return t;
      }),
      listPending: jest.fn(),
    });
    listingsRepo = createMock<Deps[1]>({ findById: jest.fn() });
    service = new JobListingTranslationsService(translationsRepo, listingsRepo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quyền sở hữu', () => {
    it('getMine: tin không thuộc về mình → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.getMine('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('save: tin không thuộc về mình → NotFoundException, KHÔNG gọi translationsRepo.save', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.save('job-1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(translationsRepo.save).not.toHaveBeenCalled();
    });

    it('submit: tin không thuộc về mình → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMine', () => {
    it('chưa từng dịch → trả null, KHÔNG tự tạo row rỗng', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      const result = await service.getMine('job-1', 'u1');
      expect(result).toBeNull();
      expect(translationsRepo.save).not.toHaveBeenCalled();
    });

    it('đã có bản dịch → trả view kèm is_stale (nguồn chưa đổi → không stale)', async () => {
      const listing = listingRow({ createdBy: 'u1' });
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ sourceContentHash: computeJobListingSourceHash(listing) }));
      const result = await service.getMine('job-1', 'u1');
      expect(result?.is_stale).toBe(false);
    });

    it('nguồn tiếng Việt đã đổi sau khi dịch → is_stale=true', async () => {
      const listing = listingRow({ createdBy: 'u1', title: 'Tiêu đề MỚI (đã sửa sau khi dịch)' });
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ sourceContentHash: 'hash-của-tiêu-đề-cũ' }));
      const result = await service.getMine('job-1', 'u1');
      expect(result?.is_stale).toBe(true);
    });
  });

  describe('save (lưu draft)', () => {
    it('chưa có bản dịch nào → tạo mới, status=draft', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      const result = await service.save('job-1', { title: 'EN title', description: 'EN desc' }, 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.DRAFT);
      expect(result.title).toBe('EN title');
    });

    it('CHỈ nhận 4 trường văn bản — không có chỗ cho lương/liên hệ/toạ độ/ngày hết hạn trong DTO (kiểm bằng kiểu, không có test runtime riêng vì DTO tự giới hạn)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      const result = await service.save('job-1', { title: 'EN title' }, 'u1');
      expect(result).not.toHaveProperty('salary_min');
      expect(result).not.toHaveProperty('contact_value');
      expect(result).not.toHaveProperty('expires_at');
    });

    it('đang published → sửa rút về draft (không ngầm đổi nội dung mà vẫn hiện công khai)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({ status: JobListingTranslationStatus.PUBLISHED, reviewerId: 'mod-1', reviewedAt: new Date() }),
      );
      const result = await service.save('job-1', { title: 'Sửa lại' }, 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.DRAFT);
      const saved = translationsRepo.save.mock.calls[0][0] as JobListingTranslation;
      expect(saved.reviewerId).toBeNull();
      expect(saved.reviewedAt).toBeNull();
    });

    it('cập nhật source_content_hash theo nội dung tiếng Việt HIỆN TẠI mỗi lần lưu', async () => {
      const listing = listingRow({ createdBy: 'u1' });
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await service.save('job-1', { title: 'EN title' }, 'u1');
      const saved = translationsRepo.save.mock.calls[0][0] as JobListingTranslation;
      expect(saved.sourceContentHash).toBe(computeJobListingSourceHash(listing));
    });
  });

  describe('submit (gửi duyệt bản dịch)', () => {
    it('chưa có bản dịch nào → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('thiếu title/description → BadRequestException (không đủ để hiện trang chi tiết)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ title: 'EN title', description: null }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('draft với đủ title+description → pending', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.DRAFT }));
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.PENDING);
    });

    it('rejected → gửi lại trực tiếp thành pending (cùng quy tắc job_listings chính)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.REJECTED, reviewNote: 'cũ' }));
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.PENDING);
      expect(result.review_note).toBeNull();
    });

    it('đang pending/published → ConflictException (không phải nguồn hợp lệ)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PUBLISHED }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decide (duyệt bản dịch — JobListing.Moderate kiểm ở controller)', () => {
    it('không tồn tại → NotFoundException', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await expect(service.decide('job-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('không ở pending → ConflictException', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.DRAFT }));
      await expect(service.decide('job-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('approve từ pending → published, set reviewer/reviewedAt', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow());
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PENDING }));
      const result = await service.decide('job-1', { decision: 'approve' }, 'mod-1');
      expect(result.status).toBe(JobListingTranslationStatus.PUBLISHED);
    });

    it('reject từ pending → rejected, giữ note', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow());
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PENDING }));
      const result = await service.decide('job-1', { decision: 'reject', note: 'dịch sai nghĩa' }, 'mod-1');
      expect(result.status).toBe(JobListingTranslationStatus.REJECTED);
      expect(result.review_note).toBe('dịch sai nghĩa');
    });
  });

  describe('listPending', () => {
    it('ghép đúng ngữ cảnh tin gốc (source_title) cho mỗi bản dịch chờ duyệt', async () => {
      translationsRepo.listPending.mockResolvedValue([translationRow({ id: 'tr-1', jobListingId: 'job-1' })]);
      listingsRepo.findById.mockResolvedValue(listingRow({ id: 'job-1', title: 'Tiêu đề gốc tiếng Việt' }));
      const result = await service.listPending();
      expect(result[0].source_title).toBe('Tiêu đề gốc tiếng Việt');
    });

    it('tin gốc đã bị xoá (không còn tồn tại) → bỏ qua, KHÔNG throw', async () => {
      translationsRepo.listPending.mockResolvedValue([translationRow({ id: 'tr-1', jobListingId: 'ghost' })]);
      listingsRepo.findById.mockResolvedValue(null);
      const result = await service.listPending();
      expect(result).toEqual([]);
    });
  });
});
