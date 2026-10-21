import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListingReportsService } from './listing-reports.service';
import { ListingReport } from './entities/listing-report.entity';
import { ListableTargetType } from '../../common/listable-target-type.enum';
import { ListingReportReason, ListingReportStatus } from './listing-reports.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function row(overrides: Partial<ListingReport> = {}): ListingReport {
  const r = new ListingReport();
  r.id = 'lr-1';
  r.reporterId = 'reporter-1';
  r.targetType = ListableTargetType.JOB_LISTING;
  r.targetId = 'job-1';
  r.reason = ListingReportReason.WRONG_INFO;
  r.description = null;
  r.status = ListingReportStatus.OPEN;
  r.resolverId = null;
  r.resolvedAt = null;
  r.createdAt = new Date('2026-10-08T00:00:00Z');
  Object.assign(r, overrides);
  return r;
}

describe('ListingReportsService', () => {
  type Deps = ConstructorParameters<typeof ListingReportsService>;
  let repo: LooseMock<Deps[0]>;
  let jobListingsService: LooseMock<Deps[1]>;
  let realEstateListingsService: LooseMock<Deps[2]>;
  let placesService: LooseMock<Deps[3]>;
  let authz: LooseMock<Deps[4]>;
  let service: ListingReportsService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({
      create: jest.fn((data) => Promise.resolve({ ...row(), ...data })),
      findById: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      listOpenByTargetType: jest.fn(),
    });
    jobListingsService = createMock<Deps[1]>({ getPublicById: jest.fn(), getMine: jest.fn() });
    realEstateListingsService = createMock<Deps[2]>({ getPublicById: jest.fn(), getMine: jest.fn() });
    placesService = createMock<Deps[3]>({ getSlugAndStatus: jest.fn(), getBySlug: jest.fn() });
    authz = createMock<Deps[4]>({ can: jest.fn() });
    service = new ListingReportsService(repo, jobListingsService, realEstateListingsService, placesService, authz);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('tin không tồn tại/không công khai → NotFoundException', async () => {
      jobListingsService.getPublicById.mockRejectedValue(new NotFoundException());
      await expect(
        service.create('reporter-1', { target_type: ListableTargetType.JOB_LISTING, target_id: 'job-x', reason: ListingReportReason.SPAM }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('báo cáo tin của chính mình → BadRequestException', async () => {
      jobListingsService.getPublicById.mockResolvedValue({ id: 'job-1' });
      jobListingsService.getMine.mockResolvedValue({ id: 'job-1' }); // không ném lỗi → là chủ tin
      await expect(
        service.create('owner-1', { target_type: ListableTargetType.JOB_LISTING, target_id: 'job-1', reason: ListingReportReason.DUPLICATE }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('báo cáo tin người khác, đang công khai → tạo thành công', async () => {
      jobListingsService.getPublicById.mockResolvedValue({ id: 'job-1' });
      jobListingsService.getMine.mockRejectedValue(new NotFoundException()); // không phải chủ tin
      const result = await service.create('reporter-1', {
        target_type: ListableTargetType.JOB_LISTING,
        target_id: 'job-1',
        reason: ListingReportReason.WRONG_INFO,
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: 'reporter-1', targetType: ListableTargetType.JOB_LISTING, status: ListingReportStatus.OPEN }),
      );
      expect(result.status).toBe(ListingReportStatus.OPEN);
    });

    it('real_estate_listing dùng ĐÚNG realEstateListingsService, không đụng jobListingsService', async () => {
      realEstateListingsService.getPublicById.mockResolvedValue({ id: 'rel-1' });
      realEstateListingsService.getMine.mockRejectedValue(new NotFoundException());
      await service.create('reporter-1', { target_type: ListableTargetType.REAL_ESTATE_LISTING, target_id: 'rel-1', reason: ListingReportReason.SCAM });
      expect(realEstateListingsService.getPublicById).toHaveBeenCalledWith('rel-1');
      expect(jobListingsService.getPublicById).not.toHaveBeenCalled();
    });

    // Giai đoạn 1 (21/10/2026) — 'place' đi qua getSlugAndStatus() rồi getBySlug() (ĐÚNG đường công
    // khai thật, xem resolveTargetPublic()'s comment), không đụng job/real-estate service nào.
    it('place dùng ĐÚNG placesService (getSlugAndStatus rồi getBySlug), không đụng job/real-estate', async () => {
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published', content_version: 1 });
      placesService.getBySlug.mockResolvedValue({ id: 'place-1', name: 'Bãi Sao' });
      const result = await service.create('reporter-1', { target_type: ListableTargetType.PLACE, target_id: 'place-1', reason: ListingReportReason.WRONG_INFO });
      expect(placesService.getSlugAndStatus).toHaveBeenCalledWith('place-1');
      expect(placesService.getBySlug).toHaveBeenCalledWith('bai-sao');
      expect(jobListingsService.getPublicById).not.toHaveBeenCalled();
      expect(realEstateListingsService.getPublicById).not.toHaveBeenCalled();
      expect(result.status).toBe(ListingReportStatus.OPEN);
    });

    it('place không tồn tại (getSlugAndStatus trả null) → NotFoundException', async () => {
      placesService.getSlugAndStatus.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', { target_type: ListableTargetType.PLACE, target_id: 'place-x', reason: ListingReportReason.WRONG_INFO }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(placesService.getBySlug).not.toHaveBeenCalled();
    });

    it('place CHƯA công khai (getBySlug ném lỗi vì status khác published) → NotFoundException, không tạo báo cáo', async () => {
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'noi-dung-nhap', status: 'draft', content_version: 1 });
      placesService.getBySlug.mockRejectedValue(new NotFoundException());
      await expect(
        service.create('reporter-1', { target_type: ListableTargetType.PLACE, target_id: 'place-x', reason: ListingReportReason.WRONG_INFO }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    // isOwnListing() luôn false cho 'place' (không có khái niệm chủ tin đơn) — không chặn tự báo cáo.
    it('place: isOwnListing luôn false, không gọi getMine của job/real-estate nào', async () => {
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published', content_version: 1 });
      placesService.getBySlug.mockResolvedValue({ id: 'place-1', name: 'Bãi Sao' });
      await service.create('any-user', { target_type: ListableTargetType.PLACE, target_id: 'place-1', reason: ListingReportReason.WRONG_INFO });
      expect(jobListingsService.getMine).not.toHaveBeenCalled();
      expect(realEstateListingsService.getMine).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('listPending()', () => {
    it('member thường (không giữ quyền Moderate nào) → mảng rỗng, không lỗi', async () => {
      authz.can.mockResolvedValue(false);
      const result = await service.listPending('member-1');
      expect(result).toEqual([]);
      expect(repo.listOpenByTargetType).not.toHaveBeenCalled();
    });

    it('chỉ giữ JobListing.Moderate → chỉ lấy báo cáo job_listing, KHÔNG gọi real_estate', async () => {
      authz.can.mockImplementation((_userId: string, perm: string) => Promise.resolve(perm === 'JobListing.Moderate'));
      repo.listOpenByTargetType.mockResolvedValue([row()]);
      const result = await service.listPending('mod-1');
      expect(repo.listOpenByTargetType).toHaveBeenCalledWith(ListableTargetType.JOB_LISTING);
      expect(repo.listOpenByTargetType).not.toHaveBeenCalledWith(ListableTargetType.REAL_ESTATE_LISTING);
      expect(result).toHaveLength(1);
    });

    it('kèm listing đã resolve (tiêu đề), null khi tin không còn công khai', async () => {
      authz.can.mockImplementation((_u: string, perm: string) => Promise.resolve(perm === 'JobListing.Moderate'));
      repo.listOpenByTargetType.mockResolvedValue([row({ id: 'lr-a', targetId: 'job-1' }), row({ id: 'lr-b', targetId: 'job-gone' })]);
      jobListingsService.getPublicById.mockImplementation((id: string) =>
        id === 'job-1' ? Promise.resolve({ id, title: 'Phục vụ bàn' }) : Promise.reject(new NotFoundException()),
      );
      const result = await service.listPending('mod-1');
      expect(result.find((r) => r.id === 'lr-a')?.listing).toEqual({ id: 'job-1', title: 'Phục vụ bàn' });
      expect(result.find((r) => r.id === 'lr-b')?.listing).toBeNull();
    });

    it('giữ CẢ ba quyền (job/BĐS/địa điểm) → gộp báo cáo của cả ba loại', async () => {
      authz.can.mockResolvedValue(true);
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published', content_version: 1 });
      placesService.getBySlug.mockResolvedValue({ id: 'place-1', name: 'Bãi Sao' });
      repo.listOpenByTargetType.mockImplementation((t: ListableTargetType) =>
        Promise.resolve([row({ targetType: t, id: `lr-${t}` })]),
      );
      const result = await service.listPending('admin-1');
      expect(result).toHaveLength(3);
      expect(result.find((r) => r.target_type === ListableTargetType.PLACE)?.listing).toEqual({ id: 'place-1', name: 'Bãi Sao' });
    });
  });

  describe('resolve()', () => {
    it('báo cáo không tồn tại → NotFoundException', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.resolve('lr-x', { decision: 'resolved' }, 'mod-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('không giữ quyền Moderate tương ứng loại target → ForbiddenException', async () => {
      repo.findById.mockResolvedValue(row({ targetType: ListableTargetType.JOB_LISTING }));
      authz.can.mockResolvedValue(false);
      await expect(service.resolve('lr-1', { decision: 'resolved' }, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
      expect(authz.can).toHaveBeenCalledWith('stranger', 'JobListing.Moderate');
    });

    // Giai đoạn 1 (21/10/2026) — báo cáo loại 'place' kiểm ĐÚNG permission đã xử lý mọi đóng góp
    // cộng đồng khác về địa điểm (PlaceEditProposal.Moderate), không phải JobListing.Moderate.
    it('báo cáo loại place → kiểm ĐÚNG permission PlaceEditProposal.Moderate', async () => {
      repo.findById.mockResolvedValue(row({ targetType: ListableTargetType.PLACE, targetId: 'place-1' }));
      authz.can.mockResolvedValue(false);
      await expect(service.resolve('lr-1', { decision: 'resolved' }, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
      expect(authz.can).toHaveBeenCalledWith('stranger', 'PlaceEditProposal.Moderate');
    });

    it('đã xử lý rồi (không còn open) → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: ListingReportStatus.RESOLVED }));
      authz.can.mockResolvedValue(true);
      await expect(service.resolve('lr-1', { decision: 'dismissed' }, 'mod-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('resolved: đổi status, gắn resolver_id/resolved_at', async () => {
      repo.findById.mockResolvedValue(row({ status: ListingReportStatus.OPEN }));
      authz.can.mockResolvedValue(true);
      const result = await service.resolve('lr-1', { decision: 'resolved' }, 'mod-1');
      expect(result.status).toBe(ListingReportStatus.RESOLVED);
      expect(result.resolved_at).not.toBeNull();
    });

    it('dismissed: đổi status thành dismissed', async () => {
      repo.findById.mockResolvedValue(row({ status: ListingReportStatus.OPEN }));
      authz.can.mockResolvedValue(true);
      const result = await service.resolve('lr-1', { decision: 'dismissed' }, 'mod-1');
      expect(result.status).toBe(ListingReportStatus.DISMISSED);
    });
  });
});
