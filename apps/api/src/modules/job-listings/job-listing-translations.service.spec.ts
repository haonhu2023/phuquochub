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
  r.employerRole = null;
  r.title = 'Tiêu đề gốc';
  r.jobCategory = 'c';
  r.workLocation = 'loc';
  r.ward = null;
  r.employmentType = JobListingEmploymentType.FULL_TIME;
  r.shiftInfo = null;
  r.salaryMin = null;
  r.salaryMax = null;
  r.salaryNegotiable = false;
  r.salaryCurrency = null;
  r.salaryPeriod = null;
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
  t.descriptionRich = null;
  t.descriptionRichHash = null;
  t.requirements = null;
  t.benefits = null;
  t.status = JobListingTranslationStatus.DRAFT;
  t.reviewNote = null;
  t.reviewerId = null;
  t.reviewedAt = null;
  t.sourceContentHash = computeJobListingSourceHash(listingRow());
  t.publishedTitle = null;
  t.publishedDescription = null;
  t.publishedDescriptionRich = null;
  t.publishedDescriptionRichHash = null;
  t.publishedRequirements = null;
  t.publishedBenefits = null;
  t.publishedSourceContentHash = null;
  t.publishedCriticalFieldsHash = null;
  t.publishedAt = null;
  t.contentVersion = 1;
  t.createdAt = new Date('2026-10-17T00:00:00Z');
  t.updatedAt = new Date('2026-10-17T00:00:00Z');
  Object.assign(t, overrides);
  return t;
}

// Vòng đời bản dịch tiếng Anh (Gói C phần 1/2, thiết kế lại 17/10/2026 sau phản hồi owner) — test
// tập trung vào ĐÚNG những điểm owner chỉ ra: (1) lưu nháp KHÔNG BAO GIỜ đụng published* (bản đã
// duyệt không mất khi sửa tiếp), (2) CAS content_version chặn ghi đè khi stale, (3) audit ghi lại
// ai/khi nào, (4) owner-only viết/gửi duyệt, JobListing.Moderate duyệt (không permission mới).
describe('JobListingTranslationsService', () => {
  type Deps = ConstructorParameters<typeof JobListingTranslationsService>;
  let translationsRepo: LooseMock<Deps[0]>;
  let listingsRepo: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let service: JobListingTranslationsService;

  beforeEach(() => {
    translationsRepo = createMock<Deps[0]>({
      findByJobListingId: jest.fn(),
      insertNew: jest.fn((entity: JobListingTranslation) => {
        entity.id = entity.id || 'tr-new';
        entity.contentVersion = entity.contentVersion ?? 1;
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
      updateWithCas: jest.fn().mockResolvedValue(true),
      listPending: jest.fn(),
      findByJobListingIds: jest.fn(),
    });
    listingsRepo = createMock<Deps[1]>({ findById: jest.fn() });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    service = new JobListingTranslationsService(translationsRepo, listingsRepo, audit);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quyền sở hữu', () => {
    it('getMine: tin không thuộc về mình → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.getMine('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('save: tin không thuộc về mình → NotFoundException, KHÔNG gọi insertNew/updateWithCas', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.save('job-1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(translationsRepo.insertNew).not.toHaveBeenCalled();
      expect(translationsRepo.updateWithCas).not.toHaveBeenCalled();
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
    });

    it('có bản dịch nháp (chưa duyệt bao giờ) → has_published=false, is_published_stale=null', async () => {
      const listing = listingRow({ createdBy: 'u1' });
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ sourceContentHash: computeJobListingSourceHash(listing) }));
      const result = await service.getMine('job-1', 'u1');
      expect(result?.has_published).toBe(false);
      expect(result?.is_stale).toBe(false);
      expect(result?.is_published_stale).toBeNull();
    });

    it('đã có published, dữ kiện tiếng Việt CHƯA đổi → has_published=true, is_published_stale=false', async () => {
      const listing = listingRow({ createdBy: 'u1' });
      listingsRepo.findById.mockResolvedValue(listing);
      const hash = computeJobListingSourceHash(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({ status: JobListingTranslationStatus.PUBLISHED, publishedTitle: 'EN title', publishedSourceContentHash: hash }),
      );
      const result = await service.getMine('job-1', 'u1');
      expect(result?.has_published).toBe(true);
      expect(result?.is_published_stale).toBe(false);
    });

    it('đã có published, nhưng LƯƠNG (không phải chỉ văn bản dịch) đã đổi sau khi duyệt → is_published_stale=true', async () => {
      const listing = listingRow({ createdBy: 'u1', salaryMin: '10000000' }); // lương đổi sau khi duyệt.
      listingsRepo.findById.mockResolvedValue(listing);
      const oldHash = computeJobListingSourceHash(listingRow({ createdBy: 'u1', salaryMin: null })); // hash lúc duyệt (lương cũ).
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({ status: JobListingTranslationStatus.PUBLISHED, publishedTitle: 'EN title', publishedSourceContentHash: oldHash }),
      );
      const result = await service.getMine('job-1', 'u1');
      expect(result?.is_published_stale).toBe(true);
    });
  });

  describe('save (lưu nháp) — KHÔNG BAO GIỜ đụng published*', () => {
    it('chưa có bản dịch nào → INSERT mới, status=draft, không cần expected_content_version', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      const result = await service.save('job-1', { title: 'EN title' }, 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.DRAFT);
      expect(translationsRepo.insertNew).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'job_listing_translation.saved', actorId: 'u1' }));
    });

    it('đã có bản dịch, KHÔNG gửi expected_content_version → BadRequestException, không ghi gì', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow());
      await expect(service.save('job-1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(translationsRepo.updateWithCas).not.toHaveBeenCalled();
    });

    it('CAS lỗi thời (updateWithCas trả false) → ConflictException, KHÔNG audit', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ contentVersion: 3 }));
      translationsRepo.updateWithCas.mockResolvedValue(false);
      await expect(service.save('job-1', { title: 'x', expected_content_version: 2 }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('CAS khớp → cập nhật VÙNG NHÁP, KHÔNG đụng published* (bản đã duyệt vẫn còn nguyên)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({
          status: JobListingTranslationStatus.PUBLISHED,
          contentVersion: 2,
          publishedTitle: 'Bản ĐÃ DUYỆT — không được đụng',
          publishedDescription: 'Mô tả đã duyệt',
          publishedSourceContentHash: 'hash-cu',
        }),
      );
      const result = await service.save('job-1', { title: 'Đang sửa tiếp', expected_content_version: 2 }, 'u1');
      // Vùng nháp đổi, rút về draft (đang sửa lại một bản đã duyệt).
      expect(result.title).toBe('Đang sửa tiếp');
      expect(result.status).toBe(JobListingTranslationStatus.DRAFT);
      // Vùng CÔNG KHAI (published*) KHÔNG đổi — đây là điểm owner yêu cầu sửa, kiểm trực tiếp patch gửi xuống repo.
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch).not.toHaveProperty('publishedTitle');
      expect(patch).not.toHaveProperty('publishedDescription');
      expect(result.has_published).toBe(true); // vẫn còn bản đã duyệt từ trước.
    });

    it('CAS khớp đúng → tăng content_version lên expected+1 trong patch', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ contentVersion: 5 }));
      await service.save('job-1', { title: 'x', expected_content_version: 5 }, 'u1');
      expect(translationsRepo.updateWithCas).toHaveBeenCalledWith('tr-1', expect.anything(), 5);
    });
  });

  // Gói D (mở rộng 18/10/2026) — "Bổ sung rich-text cho mô tả bản dịch EN tuyển dụng". Chỉ test
  // HÀNH VI MỚI (wiring) — quy tắc nguồn-sự-thật/demote/hash tự nó đã có 11 test riêng ở
  // rich-text-field.spec.ts, không lặp lại ở đây.
  describe('save — rich text cho description bản dịch (vùng NHÁP)', () => {
    const doc = (text: string) => ({ v: 1 as const, blocks: [{ type: 'p' as const, runs: [{ text }] }] });

    it('lần lưu ĐẦU TIÊN, gửi description_rich → INSERT kèm rich + hash', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await service.save('job-1', { title: 'EN title', description_rich: doc('EN rich') }, 'u1');
      const inserted = translationsRepo.insertNew.mock.calls[0][0] as JobListingTranslation;
      expect(inserted.descriptionRich).toEqual(doc('EN rich'));
      expect(inserted.description).toBe('EN rich');
      expect(inserted.descriptionRichHash).toBeTruthy();
    });

    it('CAS khớp, gửi description_rich → patch gửi xuống repo có rich + hash, KHÔNG đụng published*', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ contentVersion: 2 }));
      await service.save('job-1', { title: 'x', description_rich: doc('Cập nhật'), expected_content_version: 2 }, 'u1');
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch.descriptionRich).toEqual(doc('Cập nhật'));
      expect(patch).not.toHaveProperty('publishedDescriptionRich');
    });
  });

  describe('decide approve — snapshot CẢ rich + hash từ nháp sang published (không tính lại)', () => {
    const doc = (text: string) => ({ v: 1 as const, blocks: [{ type: 'p' as const, runs: [{ text, bold: true }] }] });

    it('nháp có description_rich → published_description_rich/hash là BẢN SAO chính xác (không tạo hash mới)', async () => {
      const listing = listingRow();
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({
          status: JobListingTranslationStatus.PENDING,
          description: 'EN rich text',
          descriptionRich: doc('EN rich text'),
          descriptionRichHash: 'hash-cua-nhap',
          contentVersion: 1,
        }),
      );
      await service.decide('job-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1');
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch.publishedDescriptionRich).toEqual(doc('EN rich text'));
      expect(patch.publishedDescriptionRichHash).toBe('hash-cua-nhap'); // copy nguyên, không tính lại
    });

    it('nháp KHÔNG có rich (chỉ plain) → published_description_rich = null (không tự tạo rich từ plain)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow());
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({ status: JobListingTranslationStatus.PENDING, description: 'Chỉ chữ thường', descriptionRich: null, contentVersion: 1 }),
      );
      await service.decide('job-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1');
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch.publishedDescriptionRich).toBeNull();
    });
  });

  describe('submit (gửi duyệt bản dịch)', () => {
    it('chưa có bản dịch nào → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('thiếu title/description → BadRequestException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ title: 'EN title', description: null }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('draft với đủ title+description → pending, có audit', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.DRAFT }));
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingTranslationStatus.PENDING);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'job_listing_translation.submitted' }));
    });

    it('CAS lỗi thời khi submit (bị sửa ngay trước đó) → ConflictException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.DRAFT }));
      translationsRepo.updateWithCas.mockResolvedValue(false);
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('đang pending/published → ConflictException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PUBLISHED }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decide (duyệt bản dịch — JobListing.Moderate kiểm ở controller, CAS bắt buộc)', () => {
    it('không tồn tại → NotFoundException', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(null);
      await expect(service.decide('job-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('không ở pending → ConflictException', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.DRAFT }));
      await expect(service.decide('job-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('KHÔNG gửi expected_content_version → BadRequestException ("moderator phải duyệt đúng phiên bản đã đọc")', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PENDING }));
      await expect(service.decide('job-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(translationsRepo.updateWithCas).not.toHaveBeenCalled();
    });

    it('CAS lỗi thời (owner vừa sửa trong lúc moderator đang xem) → ConflictException, KHÔNG audit', async () => {
      translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PENDING, contentVersion: 4 }));
      translationsRepo.updateWithCas.mockResolvedValue(false);
      listingsRepo.findById.mockResolvedValue(listingRow());
      await expect(
        service.decide('job-1', { decision: 'approve', expected_content_version: 3 }, 'mod-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('approve từ pending → published, CHỤP SNAPSHOT nháp hiện tại vào published*', async () => {
      const listing = listingRow();
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({ status: JobListingTranslationStatus.PENDING, title: 'EN title mới', description: 'EN desc mới', contentVersion: 1 }),
      );
      const result = await service.decide('job-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1');
      expect(result.status).toBe(JobListingTranslationStatus.PUBLISHED);
      expect(result.has_published).toBe(true);
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch.publishedTitle).toBe('EN title mới');
      expect(patch.publishedDescription).toBe('EN desc mới');
      expect(patch.publishedAt).toBeInstanceOf(Date);
      // Gói D điểm 4 — approve PHẢI chụp cả hash hẹp "dữ kiện quan trọng" (ca làm/địa điểm/giá/điều
      // kiện giao dịch), không chỉ hash tổng — đây là dữ liệu getPublicById() sau này dùng để biết
      // CHÍNH XÁC khi nào cần ẩn/fallback bản dịch thay vì chỉ cảnh báo chung.
      expect(patch.publishedCriticalFieldsHash).toBeTruthy();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'job_listing_translation.approved' }));
    });

    it('reject từ pending → rejected, published* KHÔNG đổi (giữ bản cũ nếu có)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow());
      translationsRepo.findByJobListingId.mockResolvedValue(
        translationRow({
          status: JobListingTranslationStatus.PENDING,
          contentVersion: 1,
          publishedTitle: 'Bản cũ vẫn còn',
          publishedSourceContentHash: 'hash-cu',
        }),
      );
      const result = await service.decide('job-1', { decision: 'reject', note: 'dịch sai nghĩa', expected_content_version: 1 }, 'mod-1');
      expect(result.status).toBe(JobListingTranslationStatus.REJECTED);
      expect(result.review_note).toBe('dịch sai nghĩa');
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch).not.toHaveProperty('publishedTitle');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'job_listing_translation.rejected' }));
    });
  });

  describe('listPending', () => {
    it('ghép đúng ngữ cảnh tin gốc (source_title) cho mỗi bản dịch chờ duyệt', async () => {
      translationsRepo.listPending.mockResolvedValue([translationRow({ id: 'tr-1', jobListingId: 'job-1' })]);
      listingsRepo.findById.mockResolvedValue(listingRow({ id: 'job-1', title: 'Tiêu đề gốc tiếng Việt' }));
      const result = await service.listPending();
      expect(result[0].source_title).toBe('Tiêu đề gốc tiếng Việt');
    });

    it('tin gốc đã bị xoá → bỏ qua, KHÔNG throw', async () => {
      translationsRepo.listPending.mockResolvedValue([translationRow({ id: 'tr-1', jobListingId: 'ghost' })]);
      listingsRepo.findById.mockResolvedValue(null);
      const result = await service.listPending();
      expect(result).toEqual([]);
    });
  });
});
