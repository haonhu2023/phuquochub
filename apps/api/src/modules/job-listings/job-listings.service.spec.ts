import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobListingsService } from './job-listings.service';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListingEmploymentType, JobListingStatus, JobListingTranslationStatus } from './job-listings.enums';
import { UpsertJobListingDto } from './dto/job-listings.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function translationRow(overrides: Partial<JobListingTranslation> = {}): JobListingTranslation {
  const t = new JobListingTranslation();
  t.id = 'tr-1';
  t.jobListingId = 'job-1';
  t.locale = 'en';
  t.title = 'EN title';
  t.description = 'EN description';
  t.requirements = null;
  t.benefits = null;
  t.status = JobListingTranslationStatus.PUBLISHED;
  t.reviewNote = null;
  t.reviewerId = null;
  t.reviewedAt = null;
  t.sourceContentHash = 'hash';
  t.createdAt = new Date('2026-10-07T00:00:00Z');
  t.updatedAt = new Date('2026-10-07T00:00:00Z');
  Object.assign(t, overrides);
  return t;
}

function baseDto(): UpsertJobListingDto {
  return {
    employer_name: 'Nhà hàng Biển Xanh',
    title: 'Phục vụ bàn',
    job_category: 'F&B',
    work_location: 'An Thới, Phú Quốc',
    employment_type: JobListingEmploymentType.FULL_TIME,
    contact_method: 'phone',
    contact_value: '0909xxxxxx',
  };
}

function row(overrides: Partial<JobListing> = {}): JobListing {
  const r = new JobListing();
  r.id = 'job-1';
  r.createdBy = 'owner-1';
  r.status = JobListingStatus.DRAFT;
  r.employerName = 'E';
  r.title = 'T';
  r.jobCategory = 'c';
  r.workLocation = 'loc';
  r.employmentType = JobListingEmploymentType.FULL_TIME;
  r.contactMethod = 'phone';
  r.contactValue = '0909';
  r.salaryNegotiable = false;
  r.publishedAt = null;
  r.reviewerId = null;
  r.reviewedAt = null;
  r.reviewNote = null;
  r.createdAt = new Date('2026-10-07T00:00:00Z');
  r.updatedAt = new Date('2026-10-07T00:00:00Z');
  Object.assign(r, overrides);
  return r;
}

// `repo.save` trả về ĐÚNG entity truyền vào (giả lập hành vi TypeORM .save() với một row đã có id) —
// để test đọc lại được các trường service vừa đổi (status/reviewerId/...) qua `result`/qua mapper.
describe('JobListingsService', () => {
  type Deps = ConstructorParameters<typeof JobListingsService>;
  let repo: LooseMock<Deps[0]>;
  let authz: LooseMock<Deps[1]>;
  let translationsRepo: LooseMock<Deps[2]>;
  let service: JobListingsService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({
      // Giả lập hành vi TypeORM thật: `repository.create()` của `JobListingsRepository` gọi `.save()`
      // bên trong (xem repository), nên createdAt/updatedAt được DB gán — mock phải gán tương tự,
      // không để mapper gọi `.toISOString()` trên `undefined`.
      create: jest.fn((entity: JobListing) => {
        entity.createdAt = entity.createdAt ?? new Date('2026-10-07T00:00:00Z');
        entity.updatedAt = entity.updatedAt ?? new Date('2026-10-07T00:00:00Z');
        return Promise.resolve(entity);
      }),
      save: jest.fn((entity: JobListing) => Promise.resolve(entity)),
      findById: jest.fn(),
      listMine: jest.fn(),
      listPublic: jest.fn(),
      countPublic: jest.fn(),
      getPublicById: jest.fn(),
      listPending: jest.fn(),
      findPlaceSummary: jest.fn().mockResolvedValue(null),
      listAllForAdmin: jest.fn(),
      countAllForAdmin: jest.fn(),
      findCreatorSummaries: jest.fn().mockResolvedValue(new Map()),
    });
    authz = createMock<Deps[1]>({ can: jest.fn() });
    translationsRepo = createMock<Deps[2]>({ findByJobListingId: jest.fn().mockResolvedValue(null) });
    service = new JobListingsService(repo, authz, translationsRepo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create/validate lương', () => {
    it('salary_min > salary_max → BadRequestException', async () => {
      await expect(
        service.create({ ...baseDto(), salary_min: 10_000_000, salary_max: 5_000_000 }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('có mức lương nhưng không có currency và không negotiable → BadRequestException', async () => {
      await expect(service.create({ ...baseDto(), salary_min: 5_000_000 }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('salary_negotiable=true bỏ qua yêu cầu currency', async () => {
      await expect(
        service.create({ ...baseDto(), salary_min: 5_000_000, salary_negotiable: true }, 'u1'),
      ).resolves.toBeDefined();
    });

    it('tạo mới luôn ở trạng thái draft, gắn created_by theo người gọi (kiểm entity truyền cho repo.create)', async () => {
      const result = await service.create(baseDto(), 'u1');
      const createdEntity = repo.create.mock.calls[0][0] as JobListing;
      expect(createdEntity.status).toBe(JobListingStatus.DRAFT);
      expect(createdEntity.createdBy).toBe('u1');
      expect(result.status).toBe(JobListingStatus.DRAFT);
      // Sender view KHÔNG có created_by riêng (chủ tin luôn là chính người gọi) — không lộ id dư thừa.
      expect(result).not.toHaveProperty('created_by');
    });
  });

  describe('quyền sở hữu (update/submit/mine)', () => {
    it('update tin không thuộc về mình → NotFoundException (không lộ tồn tại)', async () => {
      repo.findById.mockResolvedValue(row({ createdBy: 'someone-else' }));
      await expect(service.update('job-1', baseDto(), 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('submit tin không tồn tại → NotFoundException', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    // "Sửa và gửi đăng lại" — owner yêu cầu kiểm quyền này Ở SERVER, không chỉ ẩn nút phía web.
    // update() đã có test tương ứng ở trên; submit() (bước "gửi đăng lại" sau khi sửa) CHƯA có,
    // thêm ở đây cho đủ cả hai bước của luồng.
    it('submit tin không thuộc về mình → NotFoundException (không lộ tồn tại, chặn ở server)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'someone-else' }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // "Sửa và gửi đăng lại" (Gói B, 17/10/2026) — owner yêu cầu "chọn hạn mới hợp lệ", NHƯNG sửa lại
  // 17/10/2026 sau phản hồi owner: kiểm ở update() PHẢI không chặn việc sửa trường khác khi
  // expires_at KHÔNG đổi (dù đã ở quá khứ) — gate "hạn còn hiệu lực để đăng lại" THẬT nằm ở
  // submit()/decide() approve (xem describe riêng dưới), không phải ở create()/update().
  describe('assertValidExpiry (chặn CHỦ ĐỘNG đặt hạn mới ở quá khứ, không chặn giữ nguyên hạn cũ)', () => {
    it('create với expires_at ở quá khứ → BadRequestException (không có "giá trị cũ" để so sánh)', async () => {
      await expect(service.create({ ...baseDto(), expires_at: '2000-01-01' }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('update: ĐẶT một expires_at MỚI, khác giá trị cũ, và đã ở quá khứ → BadRequestException, KHÔNG gọi repo.save', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.REJECTED, createdBy: 'u1', expiresAt: '2099-01-01' }));
      await expect(service.update('job-1', { ...baseDto(), expires_at: '2000-01-01' }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('update: GIỮ NGUYÊN expires_at cũ đã quá khứ (chỉ sửa trường khác) → KHÔNG bị chặn, lưu được', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.REJECTED, createdBy: 'u1', expiresAt: '2000-01-01' }));
      const result = await service.update(
        'job-1',
        { ...baseDto(), title: 'Sửa lỗi chính tả, không đụng hạn', expires_at: '2000-01-01' },
        'u1',
      );
      expect(result.title).toBe('Sửa lỗi chính tả, không đụng hạn');
      expect(result.expires_at).toBe('2000-01-01');
    });

    it('update: XOÁ hạn cũ đã quá khứ về null → KHÔNG bị chặn (xoá hạn luôn hợp lệ)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.REJECTED, createdBy: 'u1', expiresAt: '2000-01-01' }));
      const result = await service.update('job-1', { ...baseDto(), expires_at: null }, 'u1');
      expect(result.expires_at).toBeNull();
    });

    it('expires_at = hôm nay hoặc tương lai → hợp lệ, không throw', async () => {
      const farFuture = '2099-12-31';
      await expect(service.create({ ...baseDto(), expires_at: farFuture }, 'u1')).resolves.toBeDefined();
    });

    it('expires_at không đặt (null/undefined) → luôn hợp lệ, không bắt buộc phải có hạn', async () => {
      await expect(service.create(baseDto(), 'u1')).resolves.toBeDefined();
    });
  });

  // Gate THẬT của "hạn phải còn hiệu lực để đăng lại" — ở submit() (gửi duyệt) và decide() approve
  // (duyệt), vì một tin có thể còn hạn lúc sửa nhưng hết hạn trong lúc nằm trong hàng chờ duyệt.
  describe('assertNotAlreadyExpired — gate ở submit()/decide() approve', () => {
    it('submit khi expires_at đã quá khứ → BadRequestException, KHÔNG đổi status, KHÔNG gọi repo.save', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'u1', expiresAt: '2000-01-01' }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('submit khi expires_at còn hạn/null → qua bình thường (không bị gate chặn nhầm)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'u1', expiresAt: '2099-01-01' }));
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingStatus.PENDING);
    });

    it('decide approve khi expires_at đã quá khứ (hết hạn TRONG LÚC chờ duyệt) → BadRequestException, không set reviewer/reviewedAt, KHÔNG gọi repo.save', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING, expiresAt: '2000-01-01' }));
      await expect(service.decide('job-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('decide REJECT khi expires_at đã quá khứ → KHÔNG bị gate chặn (từ chối luôn được phép bất kể hạn)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING, expiresAt: '2000-01-01' }));
      const result = await service.decide('job-1', { decision: 'reject', note: 'thiếu ảnh' }, 'mod-1');
      expect(result.status).toBe(JobListingStatus.REJECTED);
    });

    it('decide approve khi expires_at còn hạn/null → qua bình thường', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING, expiresAt: '2099-01-01' }));
      const result = await service.decide('job-1', { decision: 'approve' }, 'mod-1');
      expect(result.status).toBe(JobListingStatus.PUBLISHED);
    });
  });

  describe('bảng chuyển trạng thái', () => {
    it('submit từ draft → pending, xoá review cũ', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'u1' }));
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingStatus.PENDING);
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.reviewerId).toBeNull();
    });

    it('submit từ rejected → pending trực tiếp (không qua draft)', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.REJECTED, createdBy: 'u1', reviewNote: 'cũ' }),
      );
      const result = await service.submit('job-1', 'u1');
      expect(result.status).toBe(JobListingStatus.PENDING);
    });

    it('submit từ published → ConflictException (không phải nguồn hợp lệ)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, createdBy: 'u1' }));
      await expect(service.submit('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('update trong lúc pending rút về draft, không tự publish', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.PENDING, createdBy: 'u1', reviewerId: 'mod-1' }),
      );
      const result = await service.update('job-1', baseDto(), 'u1');
      expect(result.status).toBe(JobListingStatus.DRAFT);
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.reviewerId).toBeNull();
    });

    it('update khi published đẩy ngay về pending (ẩn khỏi công khai, buộc duyệt lại), không qua draft', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.PUBLISHED, createdBy: 'u1', publishedAt: new Date(), reviewerId: 'mod-1' }),
      );
      const result = await service.update('job-1', baseDto(), 'u1');
      expect(result.status).toBe(JobListingStatus.PENDING);
      expect(result.published_at).toBeNull();
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.reviewerId).toBeNull();
    });

    it('update khi closed → ConflictException (phải reopen trước)', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.CLOSED, createdBy: 'u1' }));
      await expect(service.update('job-1', baseDto(), 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('decide approve từ pending → published, set published_at, lộ reviewer_id cho moderator', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING }));
      const result = await service.decide('job-1', { decision: 'approve' }, 'mod-1');
      expect(result.status).toBe(JobListingStatus.PUBLISHED);
      expect(result.published_at).not.toBeNull();
      expect(result.reviewer_id).toBe('mod-1');
    });

    it('decide reject từ pending → rejected, không set published_at', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING }));
      const result = await service.decide('job-1', { decision: 'reject', note: 'thiếu thông tin' }, 'mod-1');
      expect(result.status).toBe(JobListingStatus.REJECTED);
      expect(result.published_at).toBeNull();
      expect(result.review_note).toBe('thiếu thông tin');
    });

    it('decide khi không ở pending → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT }));
      await expect(service.decide('job-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('close: chủ tin tự đóng published → closed', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, createdBy: 'u1' }));
      const result = await service.close('job-1', 'u1');
      expect(result.status).toBe(JobListingStatus.CLOSED);
    });

    it('close: người khác không phải chủ tin và không có quyền Moderate → ForbiddenException', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, createdBy: 'owner-1' }));
      authz.can.mockResolvedValue(false);
      await expect(service.close('job-1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('close: moderator (không phải chủ tin) được đóng nhờ JobListing.Moderate', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, createdBy: 'owner-1' }));
      authz.can.mockResolvedValue(true);
      const result = await service.close('job-1', 'mod-1');
      expect(result.status).toBe(JobListingStatus.CLOSED);
      expect(authz.can).toHaveBeenCalledWith('mod-1', 'JobListing.Moderate');
    });

    it('close từ draft (chưa từng published) → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'u1' }));
      await expect(service.close('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('reopen: closed → pending (luôn qua duyệt lại, không nhảy thẳng về published)', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.CLOSED, createdBy: 'u1', publishedAt: new Date() }),
      );
      const result = await service.reopen('job-1', 'u1');
      expect(result.status).toBe(JobListingStatus.PENDING);
      expect(result.published_at).toBeNull();
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.reviewerId).toBeNull();
    });

    it('reopen từ pending (chưa closed) → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.PENDING, createdBy: 'u1' }));
      await expect(service.reopen('job-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('đọc công khai', () => {
    it('getPublicById: repository trả null (chưa publish/hết hạn/không tồn tại) → NotFoundException đồng nhất', async () => {
      repo.getPublicById.mockResolvedValue(null);
      await expect(service.getPublicById('job-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getPublicById: view công khai có contact_value (mục đích của tính năng) nhưng KHÔNG có status/reviewer_id', async () => {
      repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, contactValue: '0909999999' }));
      const result = await service.getPublicById('job-1');
      expect(result.contact_value).toBe('0909999999');
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('reviewer_id');
      expect(result).not.toHaveProperty('review_note');
    });

    // Gói C (17/10/2026) — overlay bản dịch tiếng Anh ở chi tiết công khai. `locale` trả về PHẢI
    // phản ánh NỘI DUNG THỰC SỰ đã trả, không phải locale được yêu cầu (owner yêu cầu rõ: không
    // được "nhận vơ" là tiếng Anh khi chỉ fallback tiếng Việt).
    describe('overlay bản dịch tiếng Anh (Gói C)', () => {
      it('locale=en, có bản dịch PUBLISHED → trả nội dung tiếng Anh, locale="en"', async () => {
        repo.getPublicById.mockResolvedValue(
          row({ status: JobListingStatus.PUBLISHED, title: 'VI title', description: 'VI mô tả' }),
        );
        translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ title: 'EN title', description: 'EN description' }));
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('EN title');
        expect(result.description).toBe('EN description');
        expect(result.locale).toBe('en');
      });

      it('locale=en, CHƯA có bản dịch nào → fallback tiếng Việt, locale="vi" (KHÔNG nhận vơ là tiếng Anh)', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        translationsRepo.findByJobListingId.mockResolvedValue(null);
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
      });

      it('locale=en, bản dịch tồn tại nhưng CHƯA published (draft/pending/rejected) → fallback tiếng Việt, locale="vi"', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ status: JobListingTranslationStatus.PENDING }));
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
      });

      it('không truyền locale (mặc định) → luôn tiếng Việt, locale="vi", KHÔNG tra bản dịch', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        const result = await service.getPublicById('job-1');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
        expect(translationsRepo.findByJobListingId).not.toHaveBeenCalled();
      });

      it('bản dịch PUBLISHED nhưng thiếu requirements/benefits (tuỳ chọn) → giữ bản tiếng Việt cho field thiếu, không lộ null', async () => {
        repo.getPublicById.mockResolvedValue(
          row({ status: JobListingStatus.PUBLISHED, requirements: 'VI yêu cầu', benefits: 'VI quyền lợi' }),
        );
        translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ requirements: null, benefits: null }));
        const result = await service.getPublicById('job-1', 'en');
        expect(result.requirements).toBe('VI yêu cầu');
        expect(result.benefits).toBe('VI quyền lợi');
      });
    });

    // Gói B (17/10/2026) — `creator_email`/`creator_display_name` vừa thêm vào mapper CHUNG
    // (job-listings.mapper.ts). Owner yêu cầu kiểm TRỰC TIẾP việc này không lộ ra view công khai:
    // `toJobListingAdminView` CHỈ được gọi từ listAllForAdmin() — toJobListingPublicView/
    // toJobListingSenderView (dùng ở đây) không spread qua nó, nhưng kiểm trực tiếp thay vì suy ra
    // từ cấu trúc code, tránh một thay đổi sau này âm thầm làm rò.
    it('getPublicById/listPublic: KHÔNG có creator_email/creator_display_name/created_by (những field này CHỈ dành cho admin)', async () => {
      repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED }));
      const detail = await service.getPublicById('job-1');
      expect(detail).not.toHaveProperty('creator_email');
      expect(detail).not.toHaveProperty('creator_display_name');
      expect(detail).not.toHaveProperty('created_by');

      repo.listPublic.mockResolvedValue([row({ status: JobListingStatus.PUBLISHED })]);
      repo.countPublic.mockResolvedValue(1);
      const list = await service.listPublic({});
      expect(list.data[0]).not.toHaveProperty('creator_email');
      expect(list.data[0]).not.toHaveProperty('creator_display_name');
      expect(list.data[0]).not.toHaveProperty('created_by');
    });

    // "Place tùy chọn" (mục V đợt 3) — ghép tên/slug qua lookup riêng, không throw nếu không khớp.
    it('getPublicById: có place_id và khớp place thật → ghép đúng place {id,name,slug}', async () => {
      repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, placeId: 'p1' }));
      repo.findPlaceSummary.mockResolvedValue({ id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' });
      const result = await service.getPublicById('job-1');
      expect(result.place).toEqual({ id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' });
      expect(repo.findPlaceSummary).toHaveBeenCalledWith('p1');
    });

    it('getPublicById: place_id null → place=null, KHÔNG gọi lookup', async () => {
      repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, placeId: null }));
      const result = await service.getPublicById('job-1');
      expect(result.place).toBeNull();
      expect(repo.findPlaceSummary).not.toHaveBeenCalled();
    });

    it('getPublicById: có place_id nhưng không khớp hàng nào (đã xoá/không tồn tại) → place=null, KHÔNG throw', async () => {
      repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, placeId: 'ghost' }));
      repo.findPlaceSummary.mockResolvedValue(null);
      const result = await service.getPublicById('job-1');
      expect(result.place).toBeNull();
    });

    it('getMine: chủ tin đang sửa thấy đúng place đã liên kết (để prefill lại ô chọn)', async () => {
      repo.findById.mockResolvedValue(row({ createdBy: 'owner-1', placeId: 'p1' }));
      repo.findPlaceSummary.mockResolvedValue({ id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' });
      const result = await service.getMine('job-1', 'owner-1');
      expect(result.place).toEqual({ id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' });
    });

    it('listPublic: chuyển query thành filter + phân trang, gọi đúng repository', async () => {
      repo.listPublic.mockResolvedValue([row({ status: JobListingStatus.PUBLISHED })]);
      repo.countPublic.mockResolvedValue(1);
      const result = await service.listPublic({ job_category: 'F&B', ward: 'An Thới', page: 2, limit: 10 });
      expect(repo.listPublic).toHaveBeenCalledWith(
        { jobCategory: 'F&B', ward: 'An Thới', employmentType: undefined },
        10,
        10,
      );
      expect(result.meta.page).toBe(2);
      expect(result.data).toHaveLength(1);
    });
  });

  // Gói B (17/10/2026) — khác listPending() (chỉ pending): mọi status, lọc theo người đăng, kèm
  // danh tính người đăng đọc được (owner xác nhận "hàng chờ duyệt" KHÔNG phải màn hình quản lý tổng thể).
  describe('listAllForAdmin (màn hình quản lý toàn bộ tin)', () => {
    it('không lọc status/created_by → chuyển filter {} xuống repository, không ép status nào', async () => {
      repo.listAllForAdmin.mockResolvedValue([]);
      repo.countAllForAdmin.mockResolvedValue(0);
      await service.listAllForAdmin({});
      expect(repo.listAllForAdmin).toHaveBeenCalledWith({ status: undefined, createdBy: undefined }, 20, 0);
      expect(repo.countAllForAdmin).toHaveBeenCalledWith({ status: undefined, createdBy: undefined });
    });

    it('có status/created_by → truyền đúng xuống repository (phân biệt với listPending chỉ-pending)', async () => {
      repo.listAllForAdmin.mockResolvedValue([]);
      repo.countAllForAdmin.mockResolvedValue(0);
      await service.listAllForAdmin({ status: JobListingStatus.CLOSED, created_by: 'owner-1', page: 2, limit: 10 });
      expect(repo.listAllForAdmin).toHaveBeenCalledWith(
        { status: JobListingStatus.CLOSED, createdBy: 'owner-1' },
        10,
        10,
      );
    });

    it('ghép đúng tên/email người đăng theo created_by của MỖI tin (không phải một giá trị cố định)', async () => {
      repo.listAllForAdmin.mockResolvedValue([
        row({ id: 'job-1', createdBy: 'owner-1', status: JobListingStatus.PUBLISHED }),
        row({ id: 'job-2', createdBy: 'owner-2', status: JobListingStatus.CLOSED }),
      ]);
      repo.countAllForAdmin.mockResolvedValue(2);
      repo.findCreatorSummaries.mockResolvedValue(
        new Map([
          ['owner-1', { email: 'owner1@test.com', display_name: 'Chủ tin 1' }],
          ['owner-2', { email: 'owner2@test.com', display_name: 'Chủ tin 2' }],
        ]),
      );
      const result = await service.listAllForAdmin({});
      expect(repo.findCreatorSummaries).toHaveBeenCalledWith(['owner-1', 'owner-2']);
      expect(result.data[0]).toMatchObject({ id: 'job-1', creator_email: 'owner1@test.com', creator_display_name: 'Chủ tin 1' });
      expect(result.data[1]).toMatchObject({ id: 'job-2', creator_email: 'owner2@test.com', creator_display_name: 'Chủ tin 2' });
    });

    it('người đăng đã bị xoá (không có trong map) → creator_email/creator_display_name null, KHÔNG throw', async () => {
      repo.listAllForAdmin.mockResolvedValue([row({ id: 'job-1', createdBy: 'ghost' })]);
      repo.countAllForAdmin.mockResolvedValue(1);
      repo.findCreatorSummaries.mockResolvedValue(new Map());
      const result = await service.listAllForAdmin({});
      expect(result.data[0]).toMatchObject({ creator_email: null, creator_display_name: null });
    });
  });
});
