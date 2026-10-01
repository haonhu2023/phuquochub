import { AmenitiesService } from './amenities.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('AmenitiesService', () => {
  type Deps = ConstructorParameters<typeof AmenitiesService>;
  let repo: LooseMock<Deps[0]>;
  let placesService: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let cacheInvalidation: LooseMock<Deps[3]>;
  let service: AmenitiesService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({ listAll: jest.fn(), listForPlace: jest.fn(), setForPlace: jest.fn() });
    placesService = createMock<Deps[1]>({ getSlugAndStatus: jest.fn() });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    cacheInvalidation = createMock<Deps[3]>({ invalidatePlace: jest.fn().mockResolvedValue(undefined) });
    service = new AmenitiesService(repo, placesService, audit, cacheInvalidation);
  });

  it('updateForPlace: hợp lệ → set rồi trả danh sách mới + content_version, ghi audit', async () => {
    repo.setForPlace.mockResolvedValue({ invalidCodes: [], conflict: false, newVersion: 2 });
    repo.listForPlace.mockResolvedValue([{ id: 'a1', code: 'wifi' }]);
    placesService.getSlugAndStatus.mockResolvedValue({ slug: 'p', status: 'draft', content_version: 2 });

    const res = await service.updateForPlace('p1', ['wifi'], 1, 'u1');

    expect(repo.setForPlace).toHaveBeenCalledWith('p1', ['wifi'], 1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'place.amenities_replaced', entityId: 'p1', actorId: 'u1' }),
    );
    expect(res).toEqual({ amenities: [{ id: 'a1', code: 'wifi' }], content_version: 2 });
  });

  it('updateForPlace: mã không tồn tại → 400, không âm thầm bỏ qua, không ghi audit', async () => {
    repo.setForPlace.mockResolvedValue({ invalidCodes: ['khong_ton_tai'], conflict: false });

    await expect(service.updateForPlace('p1', ['khong_ton_tai'], 1, 'u1')).rejects.toThrow(/khong_ton_tai/);
    expect(repo.listForPlace).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  // CAS thật (2026-09-30) — xem HotelsService.updateDetails's ghi chú đầy đủ, cùng khuôn 409.
  it('updateForPlace: repo báo conflict → ném ConflictException, KHÔNG audit, KHÔNG invalidate cache', async () => {
    repo.setForPlace.mockResolvedValue({ invalidCodes: [], conflict: true });

    await expect(service.updateForPlace('p1', ['wifi'], 1, 'u1')).rejects.toMatchObject({ status: 409 });
    expect(audit.record).not.toHaveBeenCalled();
    expect(cacheInvalidation.invalidatePlace).not.toHaveBeenCalled();
  });

  it('updateForPlace: place đã published → invalidate cache', async () => {
    repo.setForPlace.mockResolvedValue({ invalidCodes: [], conflict: false, newVersion: 1 });
    repo.listForPlace.mockResolvedValue([]);
    placesService.getSlugAndStatus.mockResolvedValue({ slug: 'ks-a', status: 'published', content_version: 1 });

    await service.updateForPlace('p1', [], 1, 'u1');

    expect(cacheInvalidation.invalidatePlace).toHaveBeenCalledWith('ks-a');
  });
});
