import { SearchService } from './search.service';
import { PriceRange } from '../places/place.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('SearchService', () => {
  let placesRepo: LooseMock<ConstructorParameters<typeof SearchService>[0]>;
  let service: SearchService;

  beforeEach(() => {
    placesRepo = createMock<ConstructorParameters<typeof SearchService>[0]>({
      searchFullText: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'Bãi Sao', slug: 'bai-sao', short_description: 'đẹp', score: 0.7 },
      ]),
      searchCount: jest.fn().mockResolvedValue(1),
    });
    service = new SearchService(placesRepo);
  });

  it('search trả envelope phân trang + kết quả type=place', async () => {
    const res = await service.search({ q: 'phu quoc', page: 1, limit: 20 });
    expect(res.success).toBe(true);
    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({ type: 'place', id: 'p1', slug: 'bai-sao' });
  });

  // F-35 / OD-B4 (PLACE-024): ts_rank ('score' trên row) là tín hiệu xếp hạng NỘI BỘ — KHÔNG
  // được lộ ra SearchResult công khai nữa, kể cả khi repository row CÓ score (mô phỏng thực tế).
  it('KHÔNG BAO GIỜ phát `score` ra SearchResult công khai, kể cả khi row repository có score', async () => {
    const res = await service.search({ q: 'phu quoc', page: 1, limit: 20 });
    expect('score' in res.data[0]).toBe(false);
    expect(Object.keys(res.data[0]).sort()).toEqual(['id', 'slug', 'snippet', 'title', 'type']);
  });

  it('tìm không dấu: chuyển query xuống repo nguyên trạng (unaccent ở SQL)', async () => {
    await service.search({ q: 'bai sao' });
    expect(placesRepo.searchFullText).toHaveBeenCalledWith('bai sao', 20, 0, {
      category: undefined,
      ward: undefined,
      priceRange: undefined,
    });
  });

  // Search Filters (category/ward/price_range) — backward-compat: không truyền filter nào
  // vẫn tạo object filters rỗng (mọi field undefined), y hệt hành vi trước khi tính năng này
  // tồn tại (repo.searchFilterConds coi undefined là "không lọc").
  it('không truyền filter nào → filters object toàn undefined (backward-compat)', async () => {
    await service.search({ q: 'phu quoc', page: 2, limit: 10 });
    expect(placesRepo.searchFullText).toHaveBeenCalledWith('phu quoc', 10, 10, {
      category: undefined,
      ward: undefined,
      priceRange: undefined,
    });
    expect(placesRepo.searchCount).toHaveBeenCalledWith('phu quoc', {
      category: undefined,
      ward: undefined,
      priceRange: undefined,
    });
  });

  it('truyền category/ward/price_range → chuyển thẳng xuống repo dạng filters', async () => {
    await service.search({
      q: 'resort',
      category: 'cat-1',
      ward: 'An Thới',
      price_range: PriceRange.HIGH,
    });
    expect(placesRepo.searchFullText).toHaveBeenCalledWith('resort', 20, 0, {
      category: 'cat-1',
      ward: 'An Thới',
      priceRange: PriceRange.HIGH,
    });
    expect(placesRepo.searchCount).toHaveBeenCalledWith('resort', {
      category: 'cat-1',
      ward: 'An Thới',
      priceRange: PriceRange.HIGH,
    });
  });

  it('reindex Postgres FTS là no-op ok', () => {
    expect(service.reindex().status).toBe('ok');
  });
});
