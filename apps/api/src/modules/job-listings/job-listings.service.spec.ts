import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobListingsService } from './job-listings.service';
import { JobListing } from './entities/job-listing.entity';
import { JobListingEmploymentType, JobListingStatus } from './job-listings.enums';
import { UpsertJobListingDto } from './dto/job-listings.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

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
    });
    authz = createMock<Deps[1]>({ can: jest.fn() });
    service = new JobListingsService(repo, authz);
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
});
