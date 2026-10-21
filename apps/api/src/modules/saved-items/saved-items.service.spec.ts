import { NotFoundException } from '@nestjs/common';
import { SavedItemsService } from './saved-items.service';
import { SavedItemTargetType } from './saved-items.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('SavedItemsService', () => {
  type Deps = ConstructorParameters<typeof SavedItemsService>;
  let repo: LooseMock<Deps[0]>;
  let jobListingsService: LooseMock<Deps[1]>;
  let realEstateListingsService: LooseMock<Deps[2]>;
  let placesService: LooseMock<Deps[3]>;
  let service: SavedItemsService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({ create: jest.fn(), remove: jest.fn(), listMine: jest.fn() });
    jobListingsService = createMock<Deps[1]>({ getPublicById: jest.fn() });
    realEstateListingsService = createMock<Deps[2]>({ getPublicById: jest.fn() });
    placesService = createMock<Deps[3]>({ getSlugAndStatus: jest.fn(), getBySlug: jest.fn() });
    service = new SavedItemsService(repo, jobListingsService, realEstateListingsService, placesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('save()', () => {
    it('job_listing đang công khai → lưu thành công, gọi ĐÚNG jobListingsService.getPublicById', async () => {
      jobListingsService.getPublicById.mockResolvedValue({ id: 'job-1', title: 'T' });
      await service.save('u1', SavedItemTargetType.JOB_LISTING, 'job-1');
      expect(jobListingsService.getPublicById).toHaveBeenCalledWith('job-1');
      expect(realEstateListingsService.getPublicById).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith('u1', SavedItemTargetType.JOB_LISTING, 'job-1');
    });

    it('real_estate_listing đang công khai → lưu thành công, gọi ĐÚNG realEstateListingsService', async () => {
      realEstateListingsService.getPublicById.mockResolvedValue({ id: 'rel-1', title: 'T' });
      await service.save('u1', SavedItemTargetType.REAL_ESTATE_LISTING, 'rel-1');
      expect(realEstateListingsService.getPublicById).toHaveBeenCalledWith('rel-1');
      expect(repo.create).toHaveBeenCalledWith('u1', SavedItemTargetType.REAL_ESTATE_LISTING, 'rel-1');
    });

    it('tin không tồn tại/không còn công khai (getPublicById ném lỗi) → NotFoundException, KHÔNG gọi repo.create', async () => {
      jobListingsService.getPublicById.mockRejectedValue(new NotFoundException());
      await expect(service.save('u1', SavedItemTargetType.JOB_LISTING, 'job-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    // Giai đoạn 1 (21/10/2026) — 'place' đi qua getSlugAndStatus() rồi getBySlug(), không đụng
    // job/real-estate service nào (cùng lý do resolveTarget()'s comment phía service).
    it('place đang công khai → lưu thành công, gọi ĐÚNG placesService (getSlugAndStatus rồi getBySlug)', async () => {
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published', content_version: 1 });
      placesService.getBySlug.mockResolvedValue({ id: 'place-1', name: 'Bãi Sao' });
      await service.save('u1', SavedItemTargetType.PLACE, 'place-1');
      expect(placesService.getSlugAndStatus).toHaveBeenCalledWith('place-1');
      expect(placesService.getBySlug).toHaveBeenCalledWith('bai-sao');
      expect(jobListingsService.getPublicById).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith('u1', SavedItemTargetType.PLACE, 'place-1');
    });

    it('place không tồn tại (getSlugAndStatus trả null) → NotFoundException, KHÔNG gọi repo.create', async () => {
      placesService.getSlugAndStatus.mockResolvedValue(null);
      await expect(service.save('u1', SavedItemTargetType.PLACE, 'place-x')).rejects.toBeInstanceOf(NotFoundException);
      expect(placesService.getBySlug).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('unsave()', () => {
    it('gọi repo.remove với đúng user/target', async () => {
      await service.unsave('u1', SavedItemTargetType.JOB_LISTING, 'job-1');
      expect(repo.remove).toHaveBeenCalledWith('u1', SavedItemTargetType.JOB_LISTING, 'job-1');
    });
  });

  describe('listMine()', () => {
    it('trả về danh sách kèm listing đã resolve, giữ nguyên thứ tự', async () => {
      repo.listMine.mockResolvedValue([
        { id: 'si-1', userId: 'u1', targetType: SavedItemTargetType.JOB_LISTING, targetId: 'job-1', createdAt: new Date('2026-10-08T00:00:00Z') },
        { id: 'si-2', userId: 'u1', targetType: SavedItemTargetType.REAL_ESTATE_LISTING, targetId: 'rel-1', createdAt: new Date('2026-10-07T00:00:00Z') },
      ]);
      jobListingsService.getPublicById.mockResolvedValue({ id: 'job-1', title: 'Job' });
      realEstateListingsService.getPublicById.mockResolvedValue({ id: 'rel-1', title: 'REL' });

      const result = await service.listMine('u1');
      expect(result).toEqual([
        { id: 'si-1', target_type: 'job_listing', target_id: 'job-1', saved_at: '2026-10-08T00:00:00.000Z', listing: { id: 'job-1', title: 'Job' } },
        { id: 'si-2', target_type: 'real_estate_listing', target_id: 'rel-1', saved_at: '2026-10-07T00:00:00.000Z', listing: { id: 'rel-1', title: 'REL' } },
      ]);
    });

    it('địa điểm đã lưu → resolve qua placesService, giữ đúng field .name (khác .title)', async () => {
      repo.listMine.mockResolvedValue([
        { id: 'si-3', userId: 'u1', targetType: SavedItemTargetType.PLACE, targetId: 'place-1', createdAt: new Date('2026-10-20T00:00:00Z') },
      ]);
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published', content_version: 1 });
      placesService.getBySlug.mockResolvedValue({ id: 'place-1', name: 'Bãi Sao' });

      const result = await service.listMine('u1');
      expect(result).toEqual([
        { id: 'si-3', target_type: 'place', target_id: 'place-1', saved_at: '2026-10-20T00:00:00.000Z', listing: { id: 'place-1', name: 'Bãi Sao' } },
      ]);
    });

    it('tin đã lưu nhưng không còn công khai → listing: null, KHÔNG làm cả danh sách lỗi', async () => {
      repo.listMine.mockResolvedValue([
        { id: 'si-1', userId: 'u1', targetType: SavedItemTargetType.JOB_LISTING, targetId: 'job-gone', createdAt: new Date('2026-10-08T00:00:00Z') },
      ]);
      jobListingsService.getPublicById.mockRejectedValue(new NotFoundException());

      const result = await service.listMine('u1');
      expect(result[0].listing).toBeNull();
      expect(result[0].target_id).toBe('job-gone');
    });
  });
});
