import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobListingsService } from './job-listings.service';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListingEmploymentType, JobListingStatus, JobListingTranslationStatus } from './job-listings.enums';
import { UpsertJobListingDto } from './dto/job-listings.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import { computeJobListingCriticalFieldsHash, computeJobListingSourceHash } from './job-listing-translation-hash';

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
  // Mặc định: bản nháp hiện tại CHÍNH LÀ bản đã duyệt (test cho overlay công khai đọc published*,
  // không đọc title/description trần — xem job-listing-translations.service.ts's ghi chú đầu file).
  t.publishedTitle = 'EN title';
  t.publishedDescription = 'EN description';
  t.publishedRequirements = null;
  t.publishedBenefits = null;
  t.publishedSourceContentHash = 'hash';
  t.publishedCriticalFieldsHash = null;
  t.publishedAt = new Date('2026-10-07T00:00:00Z');
  t.contentVersion = 1;
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
    translationsRepo = createMock<Deps[2]>({
      findByJobListingId: jest.fn().mockResolvedValue(null),
      findByJobListingIds: jest.fn().mockResolvedValue(new Map()),
    });
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

  // Gói D — quy tắc nguồn-sự-thật giữa `description` (plain) và `description_rich` (RichDoc), xem
  // ghi chú đầy đủ ở JobListingsService.applyDescription().
  describe('applyDescription — nguồn sự thật description/description_rich', () => {
    const doc = (text: string) => ({ v: 1 as const, blocks: [{ type: 'p' as const, runs: [{ text }] }] });

    it('create: gửi description_rich → lưu RichDoc, description được DẪN XUẤT (flatten), bỏ qua description trần gửi kèm (nếu có)', async () => {
      const result = await service.create({ ...baseDto(), description: 'TRẦN KHÔNG LIÊN QUAN', description_rich: doc('Mô tả rich') }, 'u1');
      const created = repo.create.mock.calls[0][0] as JobListing;
      expect(created.descriptionRich).toEqual(doc('Mô tả rich'));
      expect(created.description).toBe('Mô tả rich');
      expect(result.description).toBe('Mô tả rich');
    });

    it('create: description_rich không hợp lệ (thiếu v) → BadRequestException, KHÔNG gọi repo.create', async () => {
      await expect(
        service.create({ ...baseDto(), description_rich: { blocks: [] } as never }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('create: không gửi description_rich → chỉ ghi description trần như cũ, descriptionRich = null', async () => {
      await service.create({ ...baseDto(), description: 'Chỉ chữ thường' }, 'u1');
      const created = repo.create.mock.calls[0][0] as JobListing;
      expect(created.descriptionRich).toBeNull();
      expect(created.description).toBe('Chỉ chữ thường');
    });

    it('update: gửi description_rich=null (xoá tường minh) → CẢ HAI cột về null, không còn sót description trần', async () => {
      repo.findById.mockResolvedValue(row({ status: JobListingStatus.DRAFT, createdBy: 'u1', description: 'cũ', descriptionRich: doc('cũ') }));
      await service.update('job-1', { ...baseDto(), description_rich: null }, 'u1');
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.descriptionRich).toBeNull();
      expect(saved.description).toBeNull();
    });

    it('update: client KHÔNG biết rich text, gửi lại ĐÚNG bản flatten hiện tại (round-trip không đổi) → GIỮ NGUYÊN descriptionRich, không demote', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.DRAFT, createdBy: 'u1', description: 'Mô tả rich', descriptionRich: doc('Mô tả rich') }),
      );
      await service.update('job-1', { ...baseDto(), description: 'Mô tả rich', description_rich: undefined }, 'u1');
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.descriptionRich).toEqual(doc('Mô tả rich'));
      expect(saved.description).toBe('Mô tả rich');
    });

    it('update: client cũ ghi đè description trần bằng nội dung THỰC SỰ khác, không gửi description_rich → DEMOTE (xoá descriptionRich), plain text mới KHÔNG bị RichDoc cũ che mất', async () => {
      repo.findById.mockResolvedValue(
        row({ status: JobListingStatus.DRAFT, createdBy: 'u1', description: 'Mô tả rich', descriptionRich: doc('Mô tả rich') }),
      );
      await service.update('job-1', { ...baseDto(), description: 'Nội dung hoàn toàn mới do client cũ gõ', description_rich: undefined }, 'u1');
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.descriptionRich).toBeNull();
      expect(saved.description).toBe('Nội dung hoàn toàn mới do client cũ gõ');
    });

    // DTO khớp Y HỆT các trường cấu-thành-hash khác của `row()` mặc định — để hash trước/sau chỉ
    // còn lệch bởi chính description_rich đang kiểm, không lẫn với việc update() ghi đè toàn bộ
    // form (employer_name/title/... của baseDto() khác mặc định của row(), sẽ tự đổi hash).
    const dtoMatchingRowDefaults = (extra: Partial<UpsertJobListingDto>): UpsertJobListingDto => ({
      employer_name: 'E',
      title: 'T',
      job_category: 'c',
      work_location: 'loc',
      employment_type: JobListingEmploymentType.FULL_TIME,
      contact_method: 'phone',
      contact_value: '0909',
      ...extra,
    });

    // Các trường optional phải khớp ĐÚNG giá trị null mà applyDto() sẽ gán (dtoMatchingRowDefaults
    // không gửi field optional nào) — nếu không, hash lệch vì undefined/null serialize khác nhau
    // trong canonicalJson(), không liên quan gì tới chính nội dung rich text đang kiểm.
    const rowMatchingOptionalNulls = (overrides: Partial<JobListing>) =>
      row({
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        shiftInfo: null,
        requirements: null,
        benefits: null,
        ward: null,
        employerRole: null,
        placeId: null,
        expiresAt: null,
        ...overrides,
      });

    it('update: đổi chỉ đậm/nghiêng (text giữ nguyên) → flatten không đổi → description (plain) không đổi, hash nguồn không đổi', async () => {
      const existing = rowMatchingOptionalNulls({ status: JobListingStatus.DRAFT, createdBy: 'u1', description: 'Quan trọng', descriptionRich: doc('Quan trọng') });
      const hashBefore = computeJobListingSourceHash(existing);
      repo.findById.mockResolvedValue(existing);
      await service.update(
        'job-1',
        dtoMatchingRowDefaults({ description_rich: { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Quan trọng', bold: true }] }] } }),
        'u1',
      );
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.description).toBe('Quan trọng');
      expect(computeJobListingSourceHash(saved)).toBe(hashBefore);
    });

    it('update: đổi chữ thật trong RichDoc → description (plain) đổi, hash nguồn đổi (bản dịch sẽ thành is_stale)', async () => {
      const existing = rowMatchingOptionalNulls({ status: JobListingStatus.DRAFT, createdBy: 'u1', description: 'Chữ cũ', descriptionRich: doc('Chữ cũ') });
      const hashBefore = computeJobListingSourceHash(existing);
      repo.findById.mockResolvedValue(existing);
      await service.update('job-1', dtoMatchingRowDefaults({ description_rich: doc('Chữ mới hoàn toàn khác') }), 'u1');
      const saved = repo.save.mock.calls[0][0] as JobListing;
      expect(saved.description).toBe('Chữ mới hoàn toàn khác');
      expect(computeJobListingSourceHash(saved)).not.toBe(hashBefore);
    });
  });

  describe('đọc công khai', () => {
    it('getPublicById: repository trả null (chưa publish/hết hạn/không tồn tại) → NotFoundException đồng nhất', async () => {
      repo.getPublicById.mockResolvedValue(null);
      await expect(service.getPublicById('job-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    // Gói D — khoá đúng điểm nối giữa mapper (serveRichDoc) và route đọc công khai thật: hash lệch
    // (mô phỏng đúng dấu vết rollback — xem rich-text-field.spec.ts's test chuỗi đầy đủ) phải khiến
    // response công khai KHÔNG lộ description_rich lỗi thời, dù entity vẫn còn giữ nó trong DB.
    it('getPublicById: description_rich_hash LỆCH description hiện tại (dấu vết rollback) → response KHÔNG lộ description_rich, vẫn trả đúng description plain', async () => {
      repo.getPublicById.mockResolvedValue(
        row({
          status: JobListingStatus.PUBLISHED,
          description: 'Nội dung do app cũ sửa trong lúc rollback',
          descriptionRich: { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Nội dung rich CŨ', bold: true }] }] },
          descriptionRichHash: 'hash-cua-noi-dung-cu-khong-con-khop',
        }),
      );
      const result = await service.getPublicById('job-1');
      expect(result.description).toBe('Nội dung do app cũ sửa trong lúc rollback');
      expect(result.description_rich).toBeNull();
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
    describe('overlay bản dịch tiếng Anh (Gói C, đọc published* — KHÔNG đọc title/description trần)', () => {
      it('locale=en, có published → trả nội dung tiếng Anh ĐÃ DUYỆT, locale="en"', async () => {
        repo.getPublicById.mockResolvedValue(
          row({ status: JobListingStatus.PUBLISHED, title: 'VI title', description: 'VI mô tả' }),
        );
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ publishedTitle: 'EN title', publishedDescription: 'EN description' }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('EN title');
        expect(result.description).toBe('EN description');
        expect(result.locale).toBe('en');
      });

      // Gói D — bug thật đã sửa: overlay EN trước đây để lọt description_rich của BẢN TIẾNG VIỆT
      // (từ `...withPlace`) vào response đang phục vụ bản dịch tiếng Anh (bản dịch EN CHƯA hỗ trợ
      // rich text) — renderer sẽ hiện nhầm RichDoc tiếng Việt trên trang tiếng Anh.
      it('locale=en, có published, tin gốc CÓ description_rich → overlay EN phải trả description_rich=null (không lộ RichDoc tiếng Việt sang trang tiếng Anh)', async () => {
        repo.getPublicById.mockResolvedValue(
          row({
            status: JobListingStatus.PUBLISHED,
            title: 'VI title',
            description: 'VI mô tả',
            descriptionRich: { v: 1, blocks: [{ type: 'p', runs: [{ text: 'VI mô tả có định dạng', bold: true }] }] },
          }),
        );
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ publishedTitle: 'EN title', publishedDescription: 'EN description (plain)' }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.description).toBe('EN description (plain)');
        expect(result.description_rich).toBeNull();
      });

      // Gói D (mở rộng 18/10/2026) — "Bổ sung rich-text cho mô tả bản dịch EN tuyển dụng": khi bản
      // dịch ĐÃ DUYỆT có rich text riêng (hash khớp), overlay PHẢI phục vụ ĐÚNG RichDoc của bản dịch
      // — không phải của tiếng Việt (đã kiểm ở trên) và không phải null một cách vô căn cứ.
      it('locale=en, bản dịch ĐÃ DUYỆT có published_description_rich riêng (hash khớp) → overlay trả ĐÚNG RichDoc của bản dịch, requirements_rich/benefits_rich vẫn null (bản dịch chưa hỗ trợ)', async () => {
        const enDoc = { v: 1 as const, blocks: [{ type: 'p' as const, runs: [{ text: 'EN rich content', bold: true }] }] };
        repo.getPublicById.mockResolvedValue(
          row({
            status: JobListingStatus.PUBLISHED,
            title: 'VI title',
            description: 'VI mô tả',
            requirements: 'VI yêu cầu',
            requirementsRich: { v: 1, blocks: [{ type: 'p', runs: [{ text: 'VI yêu cầu' }] }] },
          }),
        );
        // Hash thật phải khớp đúng flatten('EN rich content') — tính qua cùng helper production dùng.
        const { hashPlainTextForRichDoc } = jest.requireActual('../../common/rich-text-field');
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({
            publishedTitle: 'EN title',
            publishedDescription: 'EN rich content',
            publishedDescriptionRich: enDoc,
            publishedDescriptionRichHash: hashPlainTextForRichDoc('EN rich content'),
          }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.description_rich).toEqual(enDoc);
        expect(result.requirements_rich).toBeNull();
        expect(result.benefits_rich).toBeNull();
      });

      it('locale=en, CHƯA có bản dịch nào → fallback tiếng Việt, locale="vi" (KHÔNG nhận vơ là tiếng Anh)', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        translationsRepo.findByJobListingId.mockResolvedValue(null);
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
      });

      it('locale=en, có bản dịch nhưng CHƯA TỪNG được duyệt (publishedTitle=null, dù status=pending/draft) → fallback tiếng Việt', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ status: JobListingTranslationStatus.PENDING, publishedTitle: null, publishedDescription: null, publishedSourceContentHash: null, publishedAt: null }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
      });

      // Điểm owner yêu cầu sửa trực tiếp: đang có một bản ĐÃ DUYỆT, và chủ tin VỪA lưu nháp sửa
      // tiếp (status rớt về draft) — bản ĐÃ DUYỆT (published*) vẫn phải tiếp tục hiện công khai,
      // KHÔNG rớt về fallback tiếng Việt chỉ vì status hiện tại không còn là 'published'.
      it('status hiện tại là draft (đang sửa tiếp) nhưng published* vẫn còn từ lần duyệt trước → VẪN phục vụ bản đã duyệt, không fallback', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ status: JobListingTranslationStatus.DRAFT, title: 'Bản nháp đang sửa, CHƯA duyệt', publishedTitle: 'Bản ĐÃ DUYỆT' }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.title).toBe('Bản ĐÃ DUYỆT');
        expect(result.locale).toBe('en');
      });

      it('không truyền locale (mặc định) → luôn tiếng Việt, locale="vi", KHÔNG tra bản dịch', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, title: 'VI title' }));
        const result = await service.getPublicById('job-1');
        expect(result.title).toBe('VI title');
        expect(result.locale).toBe('vi');
        expect(translationsRepo.findByJobListingId).not.toHaveBeenCalled();
      });

      it('bản đã duyệt nhưng thiếu requirements/benefits (tuỳ chọn) → giữ bản tiếng Việt cho field thiếu, không lộ null', async () => {
        repo.getPublicById.mockResolvedValue(
          row({ status: JobListingStatus.PUBLISHED, requirements: 'VI yêu cầu', benefits: 'VI quyền lợi' }),
        );
        translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ publishedRequirements: null, publishedBenefits: null }));
        const result = await service.getPublicById('job-1', 'en');
        expect(result.requirements).toBe('VI yêu cầu');
        expect(result.benefits).toBe('VI quyền lợi');
      });

      it('dữ kiện tiếng Việt CHƯA đổi từ lúc duyệt → is_translation_stale=false', async () => {
        const viRow = row({ status: JobListingStatus.PUBLISHED });
        repo.getPublicById.mockResolvedValue(viRow);
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ publishedSourceContentHash: computeJobListingSourceHash(viRow) }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.is_translation_stale).toBe(false);
      });

      it('lương đổi SAU KHI duyệt → is_translation_stale=true, nhưng VẪN phục vụ bản dịch (không âm thầm ẩn)', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, salaryMin: '20000000' }));
        translationsRepo.findByJobListingId.mockResolvedValue(
          translationRow({ publishedSourceContentHash: computeJobListingSourceHash(row({ salaryMin: null })) }),
        );
        const result = await service.getPublicById('job-1', 'en');
        expect(result.is_translation_stale).toBe(true);
        expect(result.title).toBe('EN title'); // vẫn phục vụ, không rớt về VI.
      });

      it('locale=vi (hoặc không truyền) → is_translation_stale luôn false (chỉ có nghĩa với locale=en)', async () => {
        repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED }));
        const result = await service.getPublicById('job-1', 'vi');
        expect(result.is_translation_stale).toBe(false);
      });

      // Gói D điểm 4 (18/10/2026, owner yêu cầu rõ) — "không coi một cảnh báo chung là đủ" khi dữ
      // kiện QUAN TRỌNG (ca làm/địa điểm/giá/điều kiện giao dịch) đã đổi. Phân biệt RÕ với test
      // "lương đổi... VẪN phục vụ bản dịch" ở trên — khác nhau ở chỗ bản dịch đó KHÔNG có
      // publishedCriticalFieldsHash (duyệt trước khi tính năng này tồn tại, xử lý "chưa biết, không
      // ẩn"); ở đây bản dịch CÓ hash, nên hệ thống biết CHẮC CHẮN dữ kiện quan trọng đã lệch.
      describe('dữ kiện QUAN TRỌNG (ca làm/địa điểm/giá/điều kiện giao dịch) đổi SAU KHI duyệt → ẩn bản dịch, fallback tiếng Việt (không chỉ cảnh báo chung)', () => {
        it('lương đổi (nằm trong nhóm "giá") → fallback locale=vi, translation_hidden_reason="critical_fact_mismatch"', async () => {
          const viRowAtApproval = row({ salaryMin: null });
          repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, salaryMin: '20000000', salaryCurrency: 'VND' }));
          translationsRepo.findByJobListingId.mockResolvedValue(
            translationRow({
              publishedSourceContentHash: computeJobListingSourceHash(viRowAtApproval),
              publishedCriticalFieldsHash: computeJobListingCriticalFieldsHash(viRowAtApproval),
            }),
          );
          const result = await service.getPublicById('job-1', 'en');
          expect(result.locale).toBe('vi');
          expect(result.translation_hidden_reason).toBe('critical_fact_mismatch');
          expect(result.title).toBe('T'); // tiêu đề TIẾNG VIỆT (row() mặc định), KHÔNG phải 'EN title'.
        });

        it('ca làm (shift_info) đổi → cũng kích hoạt fallback (không chỉ riêng lương)', async () => {
          const viRowAtApproval = row({ shiftInfo: 'Ca sáng' });
          repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, shiftInfo: 'Ca tối' }));
          translationsRepo.findByJobListingId.mockResolvedValue(
            translationRow({ publishedCriticalFieldsHash: computeJobListingCriticalFieldsHash(viRowAtApproval) }),
          );
          const result = await service.getPublicById('job-1', 'en');
          expect(result.translation_hidden_reason).toBe('critical_fact_mismatch');
        });

        it('CHỈ mô tả (văn xuôi) đổi, dữ kiện quan trọng KHÔNG đổi → vẫn phục vụ bản dịch kèm cảnh báo chung như trước (không fallback)', async () => {
          const viRowAtApproval = row({ description: 'Mô tả cũ' });
          repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, description: 'Mô tả MỚI, chỉ đổi câu chữ' }));
          translationsRepo.findByJobListingId.mockResolvedValue(
            translationRow({
              publishedSourceContentHash: computeJobListingSourceHash(viRowAtApproval),
              publishedCriticalFieldsHash: computeJobListingCriticalFieldsHash(viRowAtApproval),
            }),
          );
          const result = await service.getPublicById('job-1', 'en');
          expect(result.locale).toBe('en'); // VẪN phục vụ bản dịch.
          expect(result.translation_hidden_reason).toBeNull();
          expect(result.is_translation_stale).toBe(true); // cảnh báo chung vẫn đúng (hash tổng lệch).
        });

        it('bản dịch được duyệt TRƯỚC khi có tính năng này (publishedCriticalFieldsHash=null) → KHÔNG tự suy diễn, không fallback dù lương đổi', async () => {
          repo.getPublicById.mockResolvedValue(row({ status: JobListingStatus.PUBLISHED, salaryMin: '20000000' }));
          translationsRepo.findByJobListingId.mockResolvedValue(translationRow({ publishedCriticalFieldsHash: null }));
          const result = await service.getPublicById('job-1', 'en');
          expect(result.translation_hidden_reason).toBeNull();
          expect(result.locale).toBe('en');
        });
      });
    });

    // Gói C §3 (17/10/2026) — thẻ tin trong danh sách công khai cũng phải overlay title, KHÔNG để
    // trang chi tiết hiện tiếng Anh mà thẻ tin của ĐÚNG tin đó vẫn hiện tiếng Việt.
    describe('listPublic overlay title theo locale (Gói C §3, batch — không N+1)', () => {
      it('locale=en → overlay title cho MỖI item có bản dịch đã duyệt, giữ VI cho item chưa có', async () => {
        repo.listPublic.mockResolvedValue([
          row({ id: 'job-a', status: JobListingStatus.PUBLISHED, title: 'VI A' }),
          row({ id: 'job-b', status: JobListingStatus.PUBLISHED, title: 'VI B' }),
        ]);
        repo.countPublic.mockResolvedValue(2);
        translationsRepo.findByJobListingIds.mockResolvedValue(
          new Map([['job-a', translationRow({ jobListingId: 'job-a', publishedTitle: 'EN A' })]]),
        );
        const result = await service.listPublic({ locale: 'en' });
        expect(translationsRepo.findByJobListingIds).toHaveBeenCalledWith(['job-a', 'job-b']); // MỘT lần gọi cho cả trang.
        expect(result.data[0]).toMatchObject({ id: 'job-a', title: 'EN A', locale: 'en' });
        expect(result.data[1]).toMatchObject({ id: 'job-b', title: 'VI B', locale: 'vi' });
      });

      it('không truyền locale → KHÔNG gọi findByJobListingIds (tránh truy vấn thừa khi không cần)', async () => {
        repo.listPublic.mockResolvedValue([row({ status: JobListingStatus.PUBLISHED })]);
        repo.countPublic.mockResolvedValue(1);
        await service.listPublic({});
        expect(translationsRepo.findByJobListingIds).not.toHaveBeenCalled();
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
